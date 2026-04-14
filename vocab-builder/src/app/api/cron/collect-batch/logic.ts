import {
    queryCollection,
    updateDocument,
    setDocument,
    runQuery,
    serverTimestamp,
    safeDocId,
} from '@/lib/appwrite/database';
import {
    getBatchStatus,
    getAllBatchResults,
    isBatchComplete,
} from '@/lib/grok-batch';
import { safeParseAIJson } from '@/lib/ai-utils';
import { GrokKeyGroup } from '@/lib/grok-client';
import { LISTENING_ELIGIBLE_TYPES } from '@/lib/exercise/config';

function getGroupForJob(jobType: string): GrokKeyGroup {
    switch (jobType) {
        case 'article_processing': return 'articles';
        case 'feed_quiz_generation':
        case 'practice_article_generation':
        case 'exercise_generation': return 'exercises';
        default: return 'articles';
    }
}

export async function runCollectBatchLogic() {
    console.log('[CollectBatch] Starting...');

    // Get all active batch jobs (both 'submitted' and 'processing')
    const submittedJobs = await runQuery('batchJobs', [
        { field: 'status', op: 'EQUAL', value: 'submitted' }
    ], 10);

    const processingJobs = await runQuery('batchJobs', [
        { field: 'status', op: 'EQUAL', value: 'processing' }
    ], 10);

    // Clean up stale 'creating' slots (claimed but never completed)
    const creatingJobs = await runQuery('batchJobs', [
        { field: 'status', op: 'EQUAL', value: 'creating' }
    ], 10);

    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    for (const staleJob of creatingJobs) {
        const submittedAt = staleJob.submittedAt as string;
        if (submittedAt && Date.now() - new Date(submittedAt).getTime() > STALE_THRESHOLD_MS) {
            console.warn(`[CollectBatch] Cleaning stale 'creating' job: ${staleJob.id}`);
            await updateDocument('batchJobs', staleJob.id as string, {
                status: 'failed',
                error: 'Stuck in creating state — xAI batch creation likely failed',
            });
        }
    }

    const activeJobs = [...submittedJobs, ...processingJobs];

    if (activeJobs.length === 0) {
        const cleaned = creatingJobs.length;
        console.log(`[CollectBatch] No active batch jobs${cleaned ? ` (cleaned ${cleaned} stale)` : ''}`);
        return { success: true, message: 'No active batches', processed: 0, cleaned };
    }

    const results: {
        jobId: string;
        type: string;
        status: string;
        succeeded: number;
        failed: number;
    }[] = [];

    for (const job of activeJobs) {
        const jobId = job.id as string;
        const batchId = job.batchId as string;
        const jobType = job.type as string;

        try {
            const group = getGroupForJob(jobType);

            const status = await getBatchStatus(batchId, group);
            console.log(`[CollectBatch] Batch ${batchId} (${jobType}): ${status.state.num_success}/${status.state.num_requests} complete, ${status.state.num_pending} pending`);

            if (!isBatchComplete(status)) {
                await updateDocument('batchJobs', jobId, { status: 'processing' });
                results.push({
                    jobId, type: jobType, status: 'still_processing',
                    succeeded: status.state.num_success,
                    failed: status.state.num_error,
                });
                continue;
            }

            const { succeeded, failed } = await getAllBatchResults(batchId, group);
            console.log(`[CollectBatch] Batch ${batchId}: ${succeeded.length} succeeded, ${failed.length} failed`);

            if (jobType === 'article_processing') {
                await processArticleResults(succeeded);
            } else if (jobType === 'feed_quiz_generation') {
                await processFeedQuizResults(succeeded);
            } else if (jobType === 'practice_article_generation') {
                await processPracticeArticleResults(succeeded, job);
            }

            await updateDocument('batchJobs', jobId, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                successCount: succeeded.length,
                failCount: failed.length,
            });

            results.push({
                jobId, type: jobType, status: 'completed',
                succeeded: succeeded.length,
                failed: failed.length,
            });

            if (failed.length > 0) {
                console.error(`[CollectBatch] ${failed.length} failed requests:`,
                    failed.slice(0, 3).map(f => `${f.batch_request_id}: ${f.error_message}`)
                );
            }
        } catch (error) {
            console.error(`[CollectBatch] Error processing batch ${batchId}:`, error);
            await updateDocument('batchJobs', jobId, {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            results.push({ jobId, type: jobType, status: 'failed', succeeded: 0, failed: 0 });
        }
    }

    console.log(`[CollectBatch] Done. Processed ${results.length} batch jobs.`);

    return {
        success: true,
        processed: results.length,
        results,
        tts: { practiceArticles: 'lazy', listeningQuizzes: 'lazy' },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function processArticleResults(
    results: { batch_request_id: string; response?: { content: string } }[]
) {
    const validPOS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'];
    const validFreq = ['common', 'intermediate', 'advanced'];
    const validLevels = ['easy', 'medium', 'hard'];

    for (const result of results) {
        const postId = result.batch_request_id.replace('article_', '');
        const content = result.response?.content;

        if (!content) {
            console.error(`[CollectBatch] No content for article ${postId}`);
            continue;
        }

        try {
            const parsed = JSON.parse(content);

            const highlightedPhrases: string[] = (parsed.highlightedPhrases || [])
                .filter((p: string) => typeof p === 'string' && p.length > 0);

            const topicVocab = (parsed.topicVocab || [])
                .filter((v: any) => v.word && v.meaning)
                .map((v: any) => ({
                    word: v.word.toLowerCase().trim(),
                    meaning: v.meaning,
                    partOfSpeech: validPOS.includes(v.partOfSpeech) ? v.partOfSpeech : 'noun',
                    topic: v.topic || parsed.detectedTopic || 'general',
                    frequency: validFreq.includes(v.frequency) ? v.frequency : 'intermediate',
                    example: v.example || '',
                }));

            const lexile = parsed.lexile ? {
                level: validLevels.includes(parsed.lexile.level) ? parsed.lexile.level : 'medium',
                score: typeof parsed.lexile.score === 'number' ? parsed.lexile.score : 1000,
                reasoning: parsed.lexile.reasoning || '',
            } : { level: 'medium', score: 1000, reasoning: '' };

            const sections = (parsed.sections || []).map((s: any, i: number) => ({
                id: `section-${i}`,
                title: s.title || undefined,
                content: s.content || '',
                vocabPhrases: Array.isArray(s.vocabPhrases) ? s.vocabPhrases : [],
            }));

            await updateDocument('posts', postId, {
                highlightedPhrases,
                detectedTopic: parsed.detectedTopic || 'General',
                topicVocab,
                lexileLevel: lexile.level,
                lexileScore: lexile.score,
                subtitle: parsed.subtitle || '',
                sections,
                processingStatus: 'completed',
                processedAt: new Date().toISOString(),
                batchProcessed: true,
            });

            console.log(`[CollectBatch] ✓ Article ${postId}: ${highlightedPhrases.length} phrases, ${topicVocab.length} vocab, ${sections.length} sections`);
        } catch (error) {
            console.error(`[CollectBatch] Failed to parse article ${postId}:`, error);
            await updateDocument('posts', postId, {
                processingStatus: 'failed',
                processingError: error instanceof Error ? error.message : 'Parse error',
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED QUIZZES RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function processFeedQuizResults(
    results: { batch_request_id: string; response?: { content: string } }[]
) {
    const dateStr = new Date().toISOString().split('T')[0];

    for (const result of results) {
        const match = result.batch_request_id.match(/^feed_quizzes_(.+)$/);
        if (!match) {
            console.error(`[CollectBatch] Invalid feed quiz request ID: ${result.batch_request_id}`);
            continue;
        }

        const userId = match[1];
        const content = result.response?.content;
        if (!content) {
            console.error(`[CollectBatch] No content for user ${userId} feed quizzes`);
            continue;
        }

        try {
            const parsed = JSON.parse(content);
            const docId = safeDocId(`${dateStr}_${userId}`);
            
            const rawItems = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.feedCards || []);

            const cards = rawItems.map((q: any, i: number) => ({
                id: `feedquiz_${dateStr}_${userId}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                userId,
                cardType: q.cardType || 'spot_flaw',
                skillAxis: q.skillAxis || 'task_achievement',
                sourceContent: q.sourceContent || '',
                sourcePlatform: q.sourcePlatform || 'linkedin', // will need a default if AI missed it
                sourceLabel: q.sourceLabel || '💼 LinkedIn post',
                prompt: q.prompt || '',
                options: Array.isArray(q.options) ? q.options : [],
                correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
                explanation: q.explanation || '',
                phraseId: q.phraseId || `unknown_${i}`,
                isRetry: q.cardType === 'retry',
                estimatedSeconds: 30,
                createdAt: new Date().toISOString(),
            }));

            const feedQuizData = {
                userId,
                date: dateStr,
                cards,
                generatedAt: new Date().toISOString(),
            };

            await setDocument('feedQuizzes', docId, feedQuizData);
            console.log(`[CollectBatch] ✓ User ${userId} feed quizzes: ${cards.length} new V2 cards generated.`);
        } catch (error) {
            console.error(`[CollectBatch] Failed to parse feed quizzes for ${userId}:`, error);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE ARTICLE RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function processPracticeArticleResults(
    results: { batch_request_id: string; response?: { content: string } }[],
    job: Record<string, unknown>
) {
    const userPhraseMap = (job.userPhraseMap || {}) as Record<string, string[]>;

    for (const result of results) {
        const match = result.batch_request_id.match(/^practice_article_(.+)$/);
        if (!match) {
            console.error(`[CollectBatch] Invalid practice article request ID: ${result.batch_request_id}`);
            continue;
        }

        const userId = match[1];
        const content = result.response?.content;
        if (!content) {
            console.error(`[CollectBatch] No content for user ${userId} practice article`);
            continue;
        }

        try {
            const parseResult = safeParseAIJson<{
                anchorPassage: any;
                excerptBlocks?: Array<{
                    excerptId: string;
                    excerptText: string;
                    questions: any[];
                }>;
                questions?: any[]; // backward compat
            }>(content);

            if (!parseResult.success) {
                console.error(`[CollectBatch] Failed to parse practice article for ${userId}`);
                continue;
            }

            const article = parseResult.data;

            // Flatten excerpt blocks → flat question array
            let rawQuestions: any[] = [];
            if (article.excerptBlocks && article.excerptBlocks.length > 0) {
                for (const block of article.excerptBlocks) {
                    const qs = (block.questions || []).map((q: any) => ({
                        ...q,
                        excerptId: block.excerptId,
                        excerptText: block.excerptText,
                        passageReference: block.excerptText,
                    }));
                    rawQuestions.push(...qs);
                }
            } else if (article.questions) {
                rawQuestions = article.questions;
            }

            // Normalize question fields
            const normalizedQuestions = rawQuestions.map((q: any, i: number) => ({
                ...q,
                id: q.id || `q_${i + 1}`,
                type: q.type || q.questionType || 'inference_bridge',
                learningPhase: q.learningPhase || 'recognition',
                passageReference: q.passageReference || q.contextSnippet || '',
                explanation: q.explanation || 'No explanation provided.',
            }));

            // Deterministic listening mode: pick 1 eligible question
            const listeningEligible = normalizedQuestions.filter(
                (q: any) => LISTENING_ELIGIBLE_TYPES.includes(q.type as any) && q.learningPhase !== 'production'
            );
            if (listeningEligible.length > 0) {
                const pick = listeningEligible[Math.floor(Math.random() * listeningEligible.length)];
                const idx = normalizedQuestions.findIndex((q: any) => q.id === pick.id);
                if (idx !== -1) {
                    normalizedQuestions[idx] = {
                        ...normalizedQuestions[idx],
                        isListening: true,
                        listeningText: normalizedQuestions[idx].excerptText || normalizedQuestions[idx].passageReference || normalizedQuestions[idx].prompt,
                    };
                }
            }

            let reviewDayIndex = 1;
            try {
                const users = await queryCollection('users', {
                    where: [{ field: '__name__', op: '==', value: userId }],
                    limit: 1,
                });
                if (users.length > 0) {
                    const stats = (users[0].stats || {}) as { reviewDayCount?: number };
                    reviewDayIndex = (stats.reviewDayCount || 0) + 1;
                }
            } catch { /* ignore */ }

            const docId = safeDocId(`sess_${userId}_${Date.now()}`);
            await setDocument('generatedSessions', docId, {
                userId,
                anchorPassage: article.anchorPassage,
                questions: normalizedQuestions,
                phraseIds: userPhraseMap[userId] || [],
                totalPhrases: (userPhraseMap[userId] || []).length,
                status: 'audio_ready', // In V2 it's immediate
                createdAt: serverTimestamp(),
                isListeningDay: true,
                reviewDayIndex,
            });

            console.log(`[CollectBatch] ✓ Practice article for ${userId}: "${article.anchorPassage?.topic}" (${normalizedQuestions.length} questions)`);
        } catch (error) {
            console.error(`[CollectBatch] Failed to parse practice article for ${userId}:`, error);
        }
    }
}
