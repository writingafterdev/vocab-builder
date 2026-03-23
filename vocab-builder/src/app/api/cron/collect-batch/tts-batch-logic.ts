/**
 * TTS Batch Pre-Generation Logic
 * 
 * Runs after collect_batch to pre-generate Grok TTS audio for:
 * 1. Feed quiz listening questions (isListening: true)
 * 2. Practice article sections (status: 'audio_ready')
 * 
 * Uses audioCache dedup to avoid re-generating identical audio.
 * Uploads MP3 to Firebase Storage and writes audioUrl back to documents.
 */

import crypto from 'crypto';
import { runQuery, getDocument, setDocument, updateDocument } from '@/lib/appwrite/database';
import { callGrokTTS } from '@/lib/grok-tts';
import { uploadToAppwriteStorage } from '@/lib/appwrite/storage';

const CONCURRENCY = 2; // Max parallel TTS calls to avoid rate limits
const VOICE_ID = 'eve' as const;

interface TTSResult {
    feedQuizAudio: number;
    sessionAudio: number;
    cached: number;
    failed: number;
}

/**
 * Generate TTS for a single text with caching.
 * Returns the audio URL or null on failure.
 */
async function generateAndCacheTTS(text: string): Promise<string | null> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return null;

    const hashId = crypto.createHash('sha256').update(`${VOICE_ID}:${trimmed}`).digest('hex');

    // Check audioCache first (dedup)
    try {
        const cached = await getDocument('audioCache', hashId);
        if (cached && cached.url) {
            console.log(`[TTS-Batch] Cache HIT: ${hashId.substring(0, 8)}...`);
            return cached.url as string;
        }
    } catch {
        // Not cached, proceed to generate
    }

    // Generate via Grok TTS
    console.log(`[TTS-Batch] Generating: ${hashId.substring(0, 8)}... (${trimmed.length} chars)`);
    const result = await callGrokTTS(trimmed, { voiceId: VOICE_ID });
    const extension = result.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';

    // Upload to Appwrite Storage
    const filename = `${hashId}.${extension}`;
    const downloadUrl = await uploadToAppwriteStorage(result.audio, filename, result.mimeType);

    if (!downloadUrl) {
        console.error(`[TTS-Batch] Upload failed for ${hashId.substring(0, 8)}`);
        return null;
    }

    // Save to audioCache for future dedup
    await setDocument('audioCache', hashId, {
        text: trimmed,
        voice: VOICE_ID,
        url: downloadUrl,
        createdAt: new Date().toISOString(),
        source: 'batch',
    });

    console.log(`[TTS-Batch] ✓ Cached: ${hashId.substring(0, 8)}`);
    return downloadUrl;
}

/**
 * Process items in batches with concurrency limit
 */
async function processWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    concurrency: number
): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(fn));
    }
}

/**
 * Pre-generate TTS for today's feed quiz listening questions.
 */
async function generateFeedQuizAudio(): Promise<{ generated: number; cached: number; failed: number }> {
    const dateStr = new Date().toISOString().split('T')[0];
    let generated = 0, cached = 0, failed = 0;

    // Get today's feed quizzes
    const feedQuizzes = await runQuery('feedQuizzes', [
        { field: 'date', op: 'EQUAL', value: dateStr }
    ], 50);

    if (feedQuizzes.length === 0) {
        console.log('[TTS-Batch] No feed quizzes for today');
        return { generated, cached, failed };
    }

    for (const quiz of feedQuizzes) {
        const quizId = quiz.id as string;
        const questions = (quiz.questions || []) as any[];
        
        // Only process listening questions that don't have audio yet
        const listeningQs = questions
            .map((q: any, idx: number) => ({ ...q, _idx: idx }))
            .filter((q: any) => q.isListening && !q.audioUrl);

        if (listeningQs.length === 0) continue;

        console.log(`[TTS-Batch] Quiz ${quizId}: ${listeningQs.length} listening questions need audio`);

        let updatedQuestions = [...questions];
        let changed = false;

        await processWithConcurrency(listeningQs, async (q: any) => {
            try {
                const url = await generateAndCacheTTS(q.scenario);
                if (url) {
                    updatedQuestions[q._idx] = { ...updatedQuestions[q._idx], audioUrl: url };
                    changed = true;
                    // Check if it was from cache
                    const hashId = crypto.createHash('sha256').update(`${VOICE_ID}:${q.scenario.trim()}`).digest('hex');
                    try {
                        const c = await getDocument('audioCache', hashId);
                        if (c && (c.source as string) !== 'batch') cached++;
                        else generated++;
                    } catch { generated++; }
                } else {
                    failed++;
                }
            } catch (err) {
                console.error(`[TTS-Batch] Failed for quiz question:`, err);
                failed++;
            }
        }, CONCURRENCY);

        // Write updated questions back to document
        if (changed) {
            // Clean internal _idx field
            updatedQuestions = updatedQuestions.map(q => {
                const { _idx, ...rest } = q;
                return rest;
            });
            await updateDocument('feedQuizzes', quizId, { questions: updatedQuestions });
            console.log(`[TTS-Batch] ✓ Updated quiz ${quizId} with audio URLs`);
        }
    }

    return { generated, cached, failed };
}

/**
 * Pre-generate TTS for practice article sections.
 */
async function generateSessionAudio(): Promise<{ generated: number; cached: number; failed: number }> {
    let generated = 0, cached = 0, failed = 0;

    // Get sessions that are ready for audio
    const sessions = await runQuery('generatedSessions', [
        { field: 'status', op: 'EQUAL', value: 'audio_ready' }
    ], 20);

    if (sessions.length === 0) {
        console.log('[TTS-Batch] No sessions need audio');
        return { generated, cached, failed };
    }

    for (const session of sessions) {
        const sessionId = session.id as string;
        const sections = (session.sections || []) as any[];

        // Filter sections without audio
        const needAudio = sections
            .map((s: any, idx: number) => ({ ...s, _idx: idx }))
            .filter((s: any) => s.content && !s.audioUrl);

        if (needAudio.length === 0) {
            // All sections already have audio, mark as completed
            await updateDocument('generatedSessions', sessionId, { status: 'completed' });
            continue;
        }

        console.log(`[TTS-Batch] Session ${sessionId}: ${needAudio.length} sections need audio`);

        let updatedSections = [...sections];
        let changed = false;

        await processWithConcurrency(needAudio, async (s: any) => {
            try {
                // Clean HTML from section content for TTS
                const plainText = (s.content as string)
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/\s+/g, ' ')
                    .trim();

                const url = await generateAndCacheTTS(plainText);
                if (url) {
                    updatedSections[s._idx] = { ...updatedSections[s._idx], audioUrl: url };
                    changed = true;
                    generated++;
                } else {
                    failed++;
                }
            } catch (err) {
                console.error(`[TTS-Batch] Failed for session section:`, err);
                failed++;
            }
        }, CONCURRENCY);

        // Write updated sections back + mark as completed
        if (changed) {
            updatedSections = updatedSections.map(s => {
                const { _idx, ...rest } = s;
                return rest;
            });
            await updateDocument('generatedSessions', sessionId, {
                sections: updatedSections,
                status: 'completed',
            });
            console.log(`[TTS-Batch] ✓ Session ${sessionId} audio complete`);
        }
    }

    return { generated, cached, failed };
}

/**
 * Main entry point for TTS batch pre-generation.
 */
export async function runTTSBatchLogic(): Promise<TTSResult> {
    console.log('[TTS-Batch] Starting batch TTS pre-generation...');

    const quizResult = await generateFeedQuizAudio();
    console.log(`[TTS-Batch] Feed quizzes: ${quizResult.generated} generated, ${quizResult.cached} cached, ${quizResult.failed} failed`);

    const sessionResult = await generateSessionAudio();
    console.log(`[TTS-Batch] Sessions: ${sessionResult.generated} generated, ${sessionResult.cached} cached, ${sessionResult.failed} failed`);

    const totals: TTSResult = {
        feedQuizAudio: quizResult.generated + quizResult.cached,
        sessionAudio: sessionResult.generated + sessionResult.cached,
        cached: quizResult.cached + sessionResult.cached,
        failed: quizResult.failed + sessionResult.failed,
    };

    console.log(`[TTS-Batch] Done. Total: ${totals.feedQuizAudio + totals.sessionAudio} audio files (${totals.cached} from cache, ${totals.failed} failed)`);

    return totals;
}
