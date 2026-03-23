import {
    queryCollection,
    updateDocument,
    setDocument,
    runQuery,
    serverTimestamp,
} from '@/lib/appwrite/database';
import {
    getBatchStatus,
    getAllBatchResults,
    isBatchComplete,
} from '@/lib/grok-batch';
import { safeParseAIJson } from '@/lib/ai-utils';
import { GrokKeyGroup } from '@/lib/grok-client';

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

    const activeJobs = [...submittedJobs, ...processingJobs];

    if (activeJobs.length === 0) {
        console.log('[CollectBatch] No active batch jobs');
        return { success: true, message: 'No active batches', processed: 0 };
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
            const docId = `${dateStr}_${userId}`;
            
            const rawItems = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items || []);

            const questions = rawItems.map((q: any, i: number) => ({
                id: `feedquiz_${dateStr}_${userId}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                phraseId: q.phraseId || `unknown_${i}`,
                phrase: q.phrase || '',
                surface: 'quote_swiper',
                phase: 'recognition',
                questionType: q.questionType || q.format || 'situation_phrase_matching',
                emotion: q.emotion || 'neutral',
                scenario: q.scenario || 'What does this mean?',
                options: Array.isArray(q.options) ? q.options : [],
                correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
                explanation: q.explanation || '',
                xpReward: 10,
                phraseIndex: q.phraseIndex,
                isListening: q.isListening || false,
            }));

            const feedQuizData = {
                userId,
                date: dateStr,
                questions,
                generatedAt: new Date().toISOString(),
            };

            await setDocument('feedQuizzes', docId, feedQuizData);
            console.log(`[CollectBatch] ✓ User ${userId} feed quizzes: ${questions.length} generated (${questions.filter((q: any) => q.isListening).length} listening).`);
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
                title: string;
                subtitle: string;
                sections: { id: string; content: string; vocabPhrases: string[] }[];
                questions: { id: string; afterSectionId: string; question: string; options: string[]; correctIndex: number; targetPhrase: string; explanation: string }[];
                quotes: { text: string; highlightedPhrases: string[] }[];
            }>(content);

            if (!parseResult.success) {
                console.error(`[CollectBatch] Failed to parse practice article for ${userId}`);
                continue;
            }

            const article = parseResult.data;

            article.sections = (article.sections || []).map((s, i) => ({
                ...s,
                id: s.id || `section_${i + 1}`,
                vocabPhrases: s.vocabPhrases || [],
            }));

            article.questions = (article.questions || []).map((q, i) => ({
                ...q,
                id: q.id || `q_${i + 1}`,
                afterSectionId: q.afterSectionId || article.sections[Math.min(i, article.sections.length - 1)]?.id || 'section_1',
            }));

            article.quotes = (article.quotes || []).slice(0, 3);

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

            const docId = `session_${userId}_${Date.now()}`;
            await setDocument('generatedSessions', docId, {
                userId,
                title: article.title,
                subtitle: article.subtitle,
                sections: article.sections,
                questions: article.questions,
                quotes: article.quotes,
                phraseIds: userPhraseMap[userId] || [],
                totalPhrases: (userPhraseMap[userId] || []).length,
                status: 'audio_ready',
                createdAt: serverTimestamp(),
                isListeningDay: true,
                reviewDayIndex,
            });

            console.log(`[CollectBatch] ✓ Practice article for ${userId}: "${article.title}" (${article.sections.length} sections, ${article.questions.length} questions, ${article.quotes.length} quotes)`);
        } catch (error) {
            console.error(`[CollectBatch] Failed to parse practice article for ${userId}:`, error);
        }
    }
}
