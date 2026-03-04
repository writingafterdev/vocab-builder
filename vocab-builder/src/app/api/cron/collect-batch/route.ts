import { NextRequest, NextResponse } from 'next/server';
import {
    queryCollection,
    updateDocument,
    setDocument,
} from '@/lib/firestore-rest';
import {
    getBatchStatus,
    getAllBatchResults,
    isBatchComplete,
} from '@/lib/grok-batch';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Collect batch results from Grok.
 * Polls active batch jobs, parses results, saves to Firestore.
 *
 * Handles two batch types:
 * - article_processing → saves phrases, vocab, sections to posts
 * - exercise_generation → saves pre-generated exercises
 *
 * Called by Vercel Cron daily at 6:00 AM ICT (1 hour after submit).
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const adminEmail = request.headers.get('x-user-email');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !adminEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[CollectBatch] Starting...');

        // Get all active batch jobs
        const activeJobs = await queryCollection('batchJobs', {
            where: [{ field: 'status', op: '==', value: 'submitted' }],
            limit: 10,
        });

        if (activeJobs.length === 0) {
            console.log('[CollectBatch] No active batch jobs');
            return NextResponse.json({ success: true, message: 'No active batches', processed: 0 });
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
                // Check batch status
                const status = await getBatchStatus(batchId);
                console.log(`[CollectBatch] Batch ${batchId} (${jobType}): ${status.state.num_success}/${status.state.num_requests} complete, ${status.state.num_pending} pending`);

                if (!isBatchComplete(status)) {
                    // Not done yet — mark as processing, try again next time
                    await updateDocument('batchJobs', jobId, { status: 'processing' });
                    results.push({
                        jobId, type: jobType, status: 'still_processing',
                        succeeded: status.state.num_success,
                        failed: status.state.num_error,
                    });
                    continue;
                }

                // Batch complete — fetch all results
                const { succeeded, failed } = await getAllBatchResults(batchId);
                console.log(`[CollectBatch] Batch ${batchId}: ${succeeded.length} succeeded, ${failed.length} failed`);

                if (jobType === 'article_processing') {
                    await processArticleResults(succeeded);
                } else if (jobType === 'exercise_generation') {
                    await processExerciseResults(succeeded);
                }

                // Mark batch job as completed
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

                // Log failures for debugging
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

        return NextResponse.json({
            success: true,
            processed: results.length,
            results,
        });
    } catch (error) {
        console.error('[CollectBatch] Fatal error:', error);
        return NextResponse.json(
            { error: 'Collect failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function processArticleResults(
    results: { batch_request_id: string; response?: { content: string } }[]
) {
    const validTypes = ['collocation', 'phrasal_verb', 'idiom', 'expression'];
    const validPOS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'];
    const validFreq = ['common', 'intermediate', 'advanced'];
    const validLevels = ['easy', 'medium', 'hard'];

    for (const result of results) {
        // Extract postId from batch_request_id: "article_{postId}"
        const postId = result.batch_request_id.replace('article_', '');
        const content = result.response?.content;

        if (!content) {
            console.error(`[CollectBatch] No content for article ${postId}`);
            continue;
        }

        try {
            const parsed = JSON.parse(content);

            // Validate & clean data
            const highlightedPhrases: string[] = (parsed.highlightedPhrases || [])
                .filter((p: string) => typeof p === 'string' && p.length > 0);

            const phraseData = (parsed.phraseData || []).map((p: any) => ({
                phrase: p.phrase,
                meaning: p.meaning,
                example: p.example || '',
                mode: p.mode || 'neutral',
                topics: Array.isArray(p.topics) ? p.topics : [],
                commonUsages: (p.commonUsages || []).slice(0, 3).map((u: any) => ({
                    phrase: u.phrase,
                    meaning: u.meaning,
                    example: u.example || '',
                    type: validTypes.includes(u.type) ? u.type : 'expression',
                    mode: u.mode || 'neutral',
                    topics: Array.isArray(u.topics) ? u.topics : [],
                })),
            }));

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

            // Save to Firestore
            await updateDocument('posts', postId, {
                highlightedPhrases,
                phraseData,
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
// EXERCISE RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function processExerciseResults(
    results: { batch_request_id: string; response?: { content: string } }[]
) {
    const dateStr = new Date().toISOString().split('T')[0];

    for (const result of results) {
        // batch_request_id format: "exercises_{userId}"
        const match = result.batch_request_id.match(/^exercises_(.+)$/);
        if (!match) {
            console.error(`[CollectBatch] Invalid exercise request ID: ${result.batch_request_id}`);
            continue;
        }

        const userId = match[1];
        const content = result.response?.content;
        if (!content) {
            console.error(`[CollectBatch] No content for user ${userId}`);
            continue;
        }

        try {
            const parsed = JSON.parse(content);
            const docId = `${dateStr}_${userId}`;

            // Validate and clean questions
            const questions = Array.isArray(parsed.questions)
                ? parsed.questions.map((q: any, i: number) => ({
                    id: `q_${dateStr}_${userId}_${i}`,
                    type: q.type || 'situation_phrase_matching',
                    content: q.content || {},
                    targetPhraseIds: Array.isArray(q.targetPhraseIds) ? q.targetPhraseIds : [],
                    contextPhraseIds: [],
                    xpReward: q.xpReward || 15,
                }))
                : [];

            // Validate and clean drills
            const drills = Array.isArray(parsed.drills)
                ? parsed.drills.map((d: any, i: number) => ({
                    id: `drill_${dateStr}_${userId}_${i}`,
                    type: d.type || 'grammar_fix',
                    weaknessId: d.weaknessId || '',
                    weaknessCategory: d.weaknessCategory || '',
                    instruction: d.instruction || '',
                    prompt: d.prompt || '',
                    options: Array.isArray(d.options) ? d.options : [],
                    correctAnswer: d.correctAnswer || '',
                    explanation: d.explanation || '',
                }))
                : [];

            // Validate immersive session
            const immersiveSession = parsed.immersiveSession && typeof parsed.immersiveSession === 'object'
                ? {
                    reading: parsed.immersiveSession.reading ? {
                        title: parsed.immersiveSession.reading.title || '',
                        content: parsed.immersiveSession.reading.content || '',
                        questions: Array.isArray(parsed.immersiveSession.reading.questions) ? parsed.immersiveSession.reading.questions : [],
                        phrases: Array.isArray(parsed.immersiveSession.reading.phrases) ? parsed.immersiveSession.reading.phrases : [],
                    } : null,
                    listening: parsed.immersiveSession.listening ? {
                        title: parsed.immersiveSession.listening.title || '',
                        content: parsed.immersiveSession.listening.content || '',
                        questions: Array.isArray(parsed.immersiveSession.listening.questions) ? parsed.immersiveSession.listening.questions : [],
                        phrases: Array.isArray(parsed.immersiveSession.listening.phrases) ? parsed.immersiveSession.listening.phrases : [],
                    } : null,
                }
                : null;

            // Validate bundle
            const bundle = parsed.bundle && typeof parsed.bundle === 'object'
                ? {
                    theme: parsed.bundle.theme || 'Practice Session',
                    question: parsed.bundle.question || '',
                    phrases: Array.isArray(parsed.bundle.phrases) ? parsed.bundle.phrases : [],
                    hints: Array.isArray(parsed.bundle.hints) ? parsed.bundle.hints : [],
                }
                : null;

            const exerciseData = {
                userId,
                date: dateStr,
                questions,
                drills,
                immersiveSession,
                bundle,
                phraseCount: questions.length,
                drillCount: drills.length,
                generatedAt: new Date().toISOString(),
                used: false,
            };

            await setDocument('preGeneratedExercises', docId, exerciseData);
            console.log(`[CollectBatch] ✓ User ${userId}: ${questions.length} questions, ${drills.length} drills, immersive=${!!immersiveSession}, bundle=${!!bundle}`);
        } catch (error) {
            console.error(`[CollectBatch] Failed to parse exercises for ${userId}:`, error);
        }
    }
}

// GET for health check
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        description: 'Collect batch results from Grok. POST to trigger.',
    });
}
