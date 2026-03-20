// Vercel Hobby plan: max 60s for serverless functions
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
    importFromRSS,
    importFromReddit,
    getEnabledSources,
    seedDefaultSources,
    type ImportedArticle,
} from '@/lib/import-sources';
import {
    queryCollection,
    updateDocument,
    addDocument,
    serverTimestamp,
} from '@/lib/firestore-rest';
import { createBatch, addBatchRequests } from '@/lib/grok-batch';
import {
    buildArticleBatchRequest,
    buildFeedQuizBatchRequest,
    buildPracticeArticleBatchRequest,
    clusterPhrasesByTopic,
    FEED_PHASE_TYPES,
    LISTENING_COMPATIBLE_TYPES,
    getPhaseForStep,
    type FeedQuizSpec,
    type PhraseForBatch,
} from '@/lib/batch-prompts';
import { getUserWeaknesses } from '@/lib/db/user-weaknesses';
import { hasGrokKey } from '@/lib/grok-client';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Daily import cron endpoint.
 * Phase 1: Fetch articles from RSS/Reddit, save as pending
 * Phase 2: Submit pending articles as Grok batch for AI processing
 * Phase 3: Submit feed quiz batch for users' due phrases (flags ~25% as listening)
 * Phase 4: Submit practice article batch for listening-day users
 *
 * Called by Vercel Cron daily at 9 PM UTC (4 AM ICT).
 */
export async function POST(request: NextRequest) {
    try {
        // Auth: CRON_SECRET or admin header
        const authHeader = request.headers.get('Authorization');
        const adminEmail = request.headers.get('x-user-email');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !adminEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[DailyImport] Starting...');

        // ═══ PHASE 1: IMPORT ARTICLES ═══

        const seeded = await seedDefaultSources();
        if (seeded > 0) console.log(`[DailyImport] Seeded ${seeded} default sources`);

        let sources = await getEnabledSources();
        if (sources.length === 0) {
            return NextResponse.json({ success: true, message: 'No enabled sources', imported: 0 });
        }

        // VERCEL TIMEOUT FIX: Sort by oldest imported date to ensure all feeds eventually rotate
        sources.sort((a, b) => {
            const timeA = typeof a.lastImportedAt === 'object' && a.lastImportedAt ? (a.lastImportedAt as any).seconds : 0;
            const timeB = typeof b.lastImportedAt === 'object' && b.lastImportedAt ? (b.lastImportedAt as any).seconds : 0;
            return timeA - timeB; // ascending (oldest first)
        });
        
        // Cap at 10 to ensure Phase 1 finishes in ~10 seconds, leaving time for Phase 2/3/4 Grok Batches
        sources = sources.slice(0, 10);

        console.log(`[DailyImport] Processing ${sources.length} sources...`);

        const byTopic = new Map<string, typeof sources>();
        for (const source of sources) {
            const group = byTopic.get(source.topic) || [];
            group.push(source);
            byTopic.set(source.topic, group);
        }

        const MAX_PER_TOPIC = 5;
        const allImported: ImportedArticle[] = [];
        const topicResults: Record<string, { total: number; new: number }> = {};

        for (const [topic, topicSources] of byTopic) {
            let topicArticles: ImportedArticle[] = [];
            const perSourceLimit = Math.max(2, Math.ceil(MAX_PER_TOPIC / topicSources.length));

            for (const source of topicSources) {
                try {
                    let articles: ImportedArticle[] = [];

                    if (source.type === 'rss' && source.url) {
                        articles = await importFromRSS(source.url, perSourceLimit, topic);
                    } else if (source.type === 'reddit' && source.subreddit) {
                        articles = await importFromReddit(source.subreddit, {
                            sort: source.sort || 'top',
                            time: source.time || 'week',
                            limit: perSourceLimit,
                            topic,
                        });
                    }

                    topicArticles.push(...articles);

                    await updateDocument('importSources', source.id, {
                        lastImportedAt: serverTimestamp(),
                        lastArticleCount: articles.filter(a => a.isNew).length,
                    });

                    console.log(`[DailyImport] ${source.type}:${source.url || source.subreddit} → ${articles.length} (${articles.filter(a => a.isNew).length} new)`);
                } catch (error) {
                    console.error(`[DailyImport] Source ${source.id} failed:`, error);
                }
            }

            const newArticles = topicArticles.filter(a => a.isNew);
            const capped = newArticles.slice(0, MAX_PER_TOPIC);
            topicResults[topic] = { total: topicArticles.length, new: capped.length };
            allImported.push(...capped);
        }

        const totalNew = allImported.filter(a => a.isNew).length;
        console.log(`[DailyImport] Phase 1 done. ${totalNew} new articles.`);

        // ═══ PHASE 2: SUBMIT ARTICLE BATCH ═══

        let articleBatchId: string | null = null;
        const hasKey = hasGrokKey('articles');

        if (hasKey) {
            try {
                // Get ALL pending posts (including previously imported ones)
                const pendingPosts = await queryCollection('posts', {
                    where: [{ field: 'processingStatus', op: '==', value: 'pending' }],
                    limit: 50,
                });

                if (pendingPosts.length > 0) {
                    const dateStr = new Date().toISOString().split('T')[0];
                    articleBatchId = await createBatch(`articles_${dateStr}`);

                    const articleRequests = pendingPosts.map(post =>
                        buildArticleBatchRequest(
                            post.id as string,
                            (post.title as string) || 'Untitled',
                            (post.content as string) || ''
                        )
                    );

                    await addBatchRequests(articleBatchId, articleRequests);

                    // Track batch job in Firestore
                    await addDocument('batchJobs', {
                        batchId: articleBatchId,
                        name: `articles_${dateStr}`,
                        provider: 'grok',
                        type: 'article_processing',
                        status: 'submitted',
                        requestIds: pendingPosts.map(p => p.id),
                        requestCount: pendingPosts.length,
                        submittedAt: new Date().toISOString(),
                    });

                    // Mark posts as batch_submitted
                    for (const post of pendingPosts) {
                        await updateDocument('posts', post.id as string, {
                            processingStatus: 'batch_submitted',
                            batchId: articleBatchId,
                        });
                    }

                    console.log(`[DailyImport] Phase 2: submitted ${pendingPosts.length} articles to Grok batch ${articleBatchId}`);
                } else {
                    console.log('[DailyImport] Phase 2: no pending articles to batch');
                }
            } catch (error) {
                console.error('[DailyImport] Phase 2 (article batch) failed:', error);
                // Continue — don't fail the whole import
            }
        } else {
            console.log('[DailyImport] Phase 2: skipped (no Grok articles key set)');
        }

        // ═══ PHASE 3: SUBMIT FEED QUIZ BATCH ═══
        // Generate feed quizzes (21 question types + daily drills) for each user's due phrases

        let feedQuizBatchId: string | null = null;
        let feedQuizRequestCount = 0;

        if (hasKey) {
            try {
                const users = await queryCollection('users', { limit: 100 });

                if (users.length > 0) {
                    const todayEnd = new Date();
                    todayEnd.setHours(23, 59, 59, 999);
                    const dateStr = new Date().toISOString().split('T')[0];
                    const allFeedQuizRequests: ReturnType<typeof buildFeedQuizBatchRequest>[] = [];

                    for (const user of users) {
                        const userId = user.id as string;

                        try {
                            // Query due phrases for this user
                            const duePhrases = await queryCollection('savedPhrases', {
                                where: [
                                    { field: 'userId', op: '==', value: userId },
                                ],
                                limit: 50,
                            });

                            // Filter for due today
                            const todayDue = duePhrases.filter(p => {
                                const nrd = p.nextReviewDate;
                                if (!nrd) return false;
                                const reviewDate = typeof nrd === 'string'
                                    ? new Date(nrd)
                                    : typeof nrd === 'object' && 'seconds' in (nrd as Record<string, unknown>)
                                        ? new Date((nrd as { seconds: number }).seconds * 1000)
                                        : new Date(nrd as string);
                                return reviewDate.getTime() <= todayEnd.getTime();
                            });

                            if (todayDue.length === 0) continue;

                            // Fetch user weaknesses for daily drill
                            let weaknesses: { id: string; category: string; specific: string; examples: string[]; correction: string; explanation: string }[] = [];
                            try {
                                const profile = await getUserWeaknesses(userId);
                                if (profile?.weaknesses) {
                                    const oneDayAgo = Date.now() / 1000 - 24 * 60 * 60;
                                    weaknesses = profile.weaknesses
                                        .filter(w => {
                                            const lp = w.lastPracticed?.seconds || 0;
                                            return lp < oneDayAgo && w.improvementScore < 80;
                                        })
                                        .slice(0, 4)
                                        .map(w => ({
                                            id: w.id,
                                            category: w.category,
                                            specific: w.specific,
                                            examples: w.examples,
                                            correction: w.correction,
                                            explanation: w.explanation,
                                        }));
                                }
                            } catch (e) {
                                console.error(`[DailyImport] Weakness fetch failed for ${userId}:`, e);
                            }

                            // Construct Feed Quiz Specs — use SRS phase to pick from feed-friendly types
                            // ~25% of listening-compatible types get flagged as isListening
                            const feedQuizSpecs: FeedQuizSpec[] = todayDue.map(p => {
                                const learningStep = (p.learningStep as number) || 1;
                                const phase = getPhaseForStep(learningStep);
                                const phaseTypes = FEED_PHASE_TYPES[phase] || FEED_PHASE_TYPES.recognition;

                                const completedFormats = (p.completedFormats || []) as string[];
                                const unused = phaseTypes.filter(t => !completedFormats.includes(t));
                                const pool = unused.length > 0 ? unused : phaseTypes;
                                const questionType = pool[Math.floor(Math.random() * pool.length)];

                                // Flag ~25% of listening-compatible types as listening mode
                                const isListeningCompatible = LISTENING_COMPATIBLE_TYPES.includes(questionType);
                                const isListening = isListeningCompatible && Math.random() < 0.25;

                                return {
                                    phraseId: p.id as string,
                                    phrase: p.phrase as string,
                                    meaning: (p.meaning as string) || '',
                                    register: (p.register as string) || 'neutral',
                                    questionType,
                                    source: 'phrase' as const,
                                    isListening,
                                };
                            });

                            // Drills — pick from comprehension types suited for error-focused learning
                            const DRILL_TYPES = ['error_detection', 'sentence_correction', 'appropriateness_judgment', 'fill_gap_mcq'];
                            const drillSpecs: FeedQuizSpec[] = weaknesses.slice(0, 2).map(w => ({
                                phraseId: w.id,
                                phrase: w.specific,
                                meaning: w.explanation,
                                register: 'neutral',
                                questionType: DRILL_TYPES[Math.floor(Math.random() * DRILL_TYPES.length)],
                                source: 'drill' as const,
                                weaknessCategory: w.category,
                                example: w.examples[0] || '',
                                correction: w.correction,
                            }));

                            const feedReq = buildFeedQuizBatchRequest(userId, [...feedQuizSpecs, ...drillSpecs]);
                            allFeedQuizRequests.push(feedReq);

                        } catch (err) {
                            console.error(`[DailyImport] Feed quiz query failed for user ${userId}:`, err);
                        }
                    }

                    // Feed Quizzes Batch Submission
                    if (allFeedQuizRequests.length > 0) {
                        const dateStr = new Date().toISOString().split('T')[0];
                        feedQuizBatchId = await createBatch(`feed_quizzes_${dateStr}`);
                        await addBatchRequests(feedQuizBatchId, allFeedQuizRequests);
                        feedQuizRequestCount = allFeedQuizRequests.length;

                        await addDocument('batchJobs', {
                            batchId: feedQuizBatchId,
                            name: `feed_quizzes_${dateStr}`,
                            provider: 'grok',
                            type: 'feed_quiz_generation',
                            status: 'submitted',
                            requestCount: allFeedQuizRequests.length,
                            submittedAt: new Date().toISOString(),
                        });

                        console.log(`[DailyImport] Phase 3: submitted ${allFeedQuizRequests.length} feed quiz requests to Grok batch ${feedQuizBatchId}`);
                    } else {
                        console.log('[DailyImport] Phase 3: no due phrases found for any user');
                    }
                }
            } catch (error) {
                console.error('[DailyImport] Phase 3 (feed quiz batch) failed:', error);
            }
        } else {
            console.log('[DailyImport] Phase 3: skipped (no Grok articles key set)');
        }

        // ═══ PHASE 4: SUBMIT PRACTICE ARTICLE BATCH ═══
        // For each user whose tomorrow is a listening day, generate a Substack-style article

        let practiceArticleBatchId: string | null = null;
        let practiceArticleRequestCount = 0;

        if (hasKey) {
            try {
                const users = await queryCollection('users', { limit: 100 });
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const tomorrowEnd = new Date(tomorrow);
                tomorrowEnd.setHours(23, 59, 59, 999);
                const dateStr = new Date().toISOString().split('T')[0];

                const allArticleRequests: ReturnType<typeof buildPracticeArticleBatchRequest>[] = [];
                const userPhraseMap: Record<string, string[]> = {};

                for (const user of users) {
                    const userId = user.id as string;
                    const stats = (user.stats || {}) as { reviewDayCount?: number };
                    const currentCount = stats.reviewDayCount || 0;
                    const tomorrowCount = currentCount + 1;
                    const isTomorrowListening = tomorrowCount % 2 === 1;

                    if (!isTomorrowListening) continue;

                    try {
                        // Get phrases due tomorrow for this user
                        const allPhrases = await queryCollection('savedPhrases', {
                            where: [{ field: 'userId', op: '==', value: userId }],
                            limit: 50,
                        });

                        const tomorrowDue = allPhrases.filter(p => {
                            const nrd = p.nextReviewDate;
                            if (!nrd) return false;
                            const reviewDate = typeof nrd === 'string'
                                ? new Date(nrd)
                                : typeof nrd === 'object' && 'seconds' in (nrd as Record<string, unknown>)
                                    ? new Date((nrd as { seconds: number }).seconds * 1000)
                                    : new Date(nrd as string);
                            return reviewDate.getTime() >= tomorrow.getTime() && reviewDate.getTime() <= tomorrowEnd.getTime();
                        });

                        // Skip step 0 phrases (always get reading)
                        const listeningPhrases = tomorrowDue
                            .filter(p => ((p.learningStep as number) || 0) > 0)
                            .slice(0, 20);

                        if (listeningPhrases.length === 0) continue;

                        // Convert to PhraseForBatch format
                        const phrasesForBatch: PhraseForBatch[] = listeningPhrases.map(p => ({
                            id: p.id as string,
                            phrase: p.phrase as string,
                            meaning: p.meaning as string | undefined,
                            register: p.register as string | undefined,
                            topics: p.topics as string[] | undefined,
                            learningStep: (p.learningStep as number) || 1,
                        }));

                        const clusters = clusterPhrasesByTopic(phrasesForBatch);
                        const req = buildPracticeArticleBatchRequest(userId, phrasesForBatch, clusters);
                        allArticleRequests.push(req);
                        userPhraseMap[userId] = listeningPhrases.map(p => p.id as string);

                    } catch (err) {
                        console.error(`[DailyImport] Practice article query failed for user ${userId}:`, err);
                    }
                }

                if (allArticleRequests.length > 0) {
                    practiceArticleBatchId = await createBatch(`practice_articles_${dateStr}`);
                    await addBatchRequests(practiceArticleBatchId, allArticleRequests);
                    practiceArticleRequestCount = allArticleRequests.length;

                    await addDocument('batchJobs', {
                        batchId: practiceArticleBatchId,
                        name: `practice_articles_${dateStr}`,
                        provider: 'grok',
                        type: 'practice_article_generation',
                        status: 'submitted',
                        userPhraseMap,
                        requestCount: allArticleRequests.length,
                        submittedAt: new Date().toISOString(),
                    });

                    console.log(`[DailyImport] Phase 4: submitted ${allArticleRequests.length} practice article requests to batch ${practiceArticleBatchId}`);
                } else {
                    console.log('[DailyImport] Phase 4: no listening-day users with due phrases');
                }

            } catch (error) {
                console.error('[DailyImport] Phase 4 (practice article batch) failed:', error);
            }
        } else {
            console.log('[DailyImport] Phase 4: skipped (no Grok articles key set)');
        }

        return NextResponse.json({
            success: true,
            imported: totalNew,
            topics: topicResults,
            articles: allImported.filter(a => a.isNew).map(a => ({
                id: a.id,
                title: a.title,
                source: a.source,
            })),
            batch: {
                articles: articleBatchId ? { batchId: articleBatchId, count: allImported.length } : null,
                feedQuizzes: feedQuizBatchId ? { batchId: feedQuizBatchId, count: feedQuizRequestCount } : null,
                practiceArticles: practiceArticleBatchId ? { batchId: practiceArticleBatchId, count: practiceArticleRequestCount } : null,
            },
        });
    } catch (error) {
        console.error('[DailyImport] Fatal error:', error);
        return NextResponse.json(
            { error: 'Import failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// GET handler — Vercel crons send GET requests
export async function GET(request: NextRequest) {
    return POST(request);
}
