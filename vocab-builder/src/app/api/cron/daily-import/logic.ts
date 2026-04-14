import {
    importFromRSS,
    importFromReddit,
    getEnabledSources,
    seedDefaultSources,
    type ImportedArticle,
} from '@/lib/import-sources';
import {
    queryCollection,
    runQuery,
    updateDocument,
    addDocument,
    getDocument,
    setDocument,
    safeDocId,
    serverTimestamp,
} from '@/lib/appwrite/database';
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

import { hasGrokKey } from '@/lib/grok-client';
import { getWeakestTypes, getRetryContext } from '@/lib/db/question-weaknesses';

/**
 * Check if a batch of the given type was already created today.
 * Uses deterministic doc ID AND a secondary query for safety.
 */
async function isBatchAlreadyCreatedToday(batchDocId: string, batchType: string): Promise<boolean> {
    // Primary: deterministic doc ID check
    const existing = await getDocument('batchJobs', batchDocId);
    if (existing) return true;

    // Secondary: query for any batch of same type from today (catches race conditions)
    const dateStr = new Date().toISOString().split('T')[0];
    const todayBatches = await queryCollection('batchJobs', {
        where: [{ field: 'type', op: '==', value: batchType }],
        orderBy: [{ field: '$createdAt', direction: 'desc' }],
        limit: 10
    });

    // Check if any batch was created today (by parsing submittedAt)
    return todayBatches.some(b => {
        const submitted = b.submittedAt as string;
        return submitted && submitted.startsWith(dateStr);
    });
}

export async function runDailyImportLogic() {
    console.log('[DailyImport] Starting...');

    // ═══ PHASE 1: IMPORT ARTICLES ═══

    const seeded = await seedDefaultSources();
    if (seeded > 0) console.log(`[DailyImport] Seeded ${seeded} default sources`);

    let sources = await getEnabledSources();
    if (sources.length === 0) {
        return { success: true, message: 'No enabled sources', imported: 0 };
    }

    sources.sort((a, b) => {
        const timeA = typeof a.lastImportedAt === 'object' && a.lastImportedAt ? (a.lastImportedAt as any).seconds : 0;
        const timeB = typeof b.lastImportedAt === 'object' && b.lastImportedAt ? (b.lastImportedAt as any).seconds : 0;
        return timeA - timeB; 
    });

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
            const dateStr = new Date().toISOString().split('T')[0];
            const batchDocId = safeDocId(`articles_${dateStr}`);

            // Dedup: check by deterministic document ID AND by type+date query
            const alreadyExists = await isBatchAlreadyCreatedToday(batchDocId, 'article_processing');
            if (alreadyExists) {
                console.log(`[DailyImport] Phase 2: skipped (article batch already exists for today)`);
            } else {
                const pendingPosts = await runQuery('posts', [
                    { field: 'processingStatus', op: 'EQUAL', value: 'pending' }
                ], 50);

                if (pendingPosts.length > 0) {
                    // Claim the slot FIRST to prevent races
                    await setDocument('batchJobs', batchDocId, {
                        name: `articles_${dateStr}`,
                        provider: 'grok',
                        type: 'article_processing',
                        status: 'creating',
                        batchId: 'pending',
                        requestCount: pendingPosts.length,
                        submittedAt: new Date().toISOString(),
                    });

                    articleBatchId = await createBatch(`articles_${dateStr}`);

                    const articleRequests = pendingPosts.map(post =>
                        buildArticleBatchRequest(
                            post.id as string,
                            (post.title as string) || 'Untitled',
                            (post.content as string) || ''
                        )
                    );

                    await addBatchRequests(articleBatchId, articleRequests);

                    // Update with real batch ID and mark as submitted
                    await updateDocument('batchJobs', batchDocId, {
                        batchId: articleBatchId,
                        status: 'submitted',
                    });

                    await Promise.all(pendingPosts.map(post => 
                        updateDocument('posts', post.id as string, {
                            processingStatus: 'batch_submitted',
                            batchId: articleBatchId,
                        })
                    ));

                    console.log(`[DailyImport] Phase 2: submitted ${pendingPosts.length} articles to Grok batch ${articleBatchId}`);
                } else {
                    console.log('[DailyImport] Phase 2: no pending articles to batch');
                }
            }
        } catch (error) {
            console.error('[DailyImport] Phase 2 (article batch) failed:', error);
        }
    } else {
        console.log('[DailyImport] Phase 2: skipped (no Grok articles key set)');
    }

    // ═══ PHASE 3: SUBMIT FEED QUIZ BATCH ═══

    let feedQuizBatchId: string | null = null;
    let feedQuizRequestCount = 0;

    if (hasKey) {
        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const batchDocId = safeDocId(`feedquizzes_${dateStr}`);

            const alreadyExists = await isBatchAlreadyCreatedToday(batchDocId, 'feed_quiz_generation');
            if (alreadyExists) {
                console.log(`[DailyImport] Phase 3: skipped (feed quiz batch already exists for today)`);
            } else {
                const users = await queryCollection('users', { limit: 100 });

                if (users.length > 0) {
                    const todayEnd = new Date();
                    todayEnd.setHours(23, 59, 59, 999);
                    const allFeedQuizRequests: ReturnType<typeof buildFeedQuizBatchRequest>[] = [];

                    for (const user of users) {
                        const userId = user.id as string;

                        try {
                            const duePhrases = await runQuery('savedPhrases', [
                                { field: 'userId', op: 'EQUAL', value: userId }
                            ], 50);

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

                            // ── Skip phrases that already have unconsumed quiz cards ──
                            // Check up to 3 recent days for existing quiz cards
                            const coveredPhraseIds = new Set<string>();
                            for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
                                const d = new Date();
                                d.setDate(d.getDate() - daysAgo);
                                const checkDate = d.toISOString().split('T')[0];
                                const quizDocId = safeDocId(`${checkDate}_${userId}`);
                                try {
                                    const existingQuiz = await getDocument('feedQuizzes', quizDocId);
                                    if (existingQuiz) {
                                        const cards = (existingQuiz.cards || []) as Array<{ phraseId?: string }>;
                                        for (const card of cards) {
                                            if (card.phraseId && !card.phraseId.startsWith('unknown_')) {
                                                coveredPhraseIds.add(card.phraseId);
                                            }
                                        }
                                    }
                                } catch { /* doc doesn't exist, fine */ }
                            }

                            // Filter out phrases that already have pending quiz cards
                            const freshDue = coveredPhraseIds.size > 0
                                ? todayDue.filter(p => !coveredPhraseIds.has(p.id as string))
                                : todayDue;

                            if (freshDue.length === 0) {
                                console.log(`[DailyImport] Phase 3: user ${userId} — all ${todayDue.length} due phrases already covered by recent quizzes, skipping`);
                                continue;
                            }

                            if (coveredPhraseIds.size > 0) {
                                console.log(`[DailyImport] Phase 3: user ${userId} — ${todayDue.length} due, ${todayDue.length - freshDue.length} already covered, ${freshDue.length} fresh`);
                            }

                            const weakTypes = await getWeakestTypes(userId);

                            const feedQuizSpecs: FeedQuizSpec[] = freshDue.map(p => {
                                const pool = ['ab_natural', 'spot_flaw', 'spot_intruder'];
                                const questionType = pool[Math.floor(Math.random() * pool.length)];

                                return {
                                    phraseId: p.id as string,
                                    phrase: p.phrase as string,
                                    meaning: (p.meaning as string) || '',
                                    register: (p.register as string) || 'neutral',
                                    questionType,
                                    source: 'phrase' as const,
                                };
                            });

                            const drillSpecs: FeedQuizSpec[] = [];
                            for (const weakType of weakTypes.slice(0, 1)) {
                                const context = await getRetryContext(userId, weakType as any);
                                const lastError = context[0];
                                drillSpecs.push({
                                    phraseId: weakType,
                                    phrase: lastError?.vocabPhrase || '',
                                    meaning: '',
                                    register: 'neutral',
                                    questionType: 'retry',
                                    source: 'drill' as const,
                                    weaknessCategory: weakType,
                                    example: lastError?.userAnswer || '',
                                    correction: '',
                                });
                            }

                            if (feedQuizSpecs.length > 0) {
                                feedQuizSpecs[feedQuizSpecs.length - 1].questionType = 'fix_it';
                            }

                            const feedReq = buildFeedQuizBatchRequest(userId, [...feedQuizSpecs, ...drillSpecs]);
                            allFeedQuizRequests.push(feedReq);

                        } catch (err) {
                            console.error(`[DailyImport] Feed quiz query failed for user ${userId}:`, err);
                        }
                    }

                    if (allFeedQuizRequests.length > 0) {
                        // Claim the slot FIRST
                        await setDocument('batchJobs', batchDocId, {
                            name: `feed_quizzes_${dateStr}`,
                            provider: 'grok',
                            type: 'feed_quiz_generation',
                            status: 'creating',
                            batchId: 'pending',
                            requestCount: allFeedQuizRequests.length,
                            submittedAt: new Date().toISOString(),
                        });

                        feedQuizBatchId = await createBatch(`feed_quizzes_${dateStr}`, 'exercises');
                        await addBatchRequests(feedQuizBatchId, allFeedQuizRequests, 'exercises');
                        feedQuizRequestCount = allFeedQuizRequests.length;

                        await updateDocument('batchJobs', batchDocId, {
                            batchId: feedQuizBatchId,
                            status: 'submitted',
                        });

                        console.log(`[DailyImport] Phase 3: submitted ${allFeedQuizRequests.length} feed quiz requests to Grok batch ${feedQuizBatchId}`);
                    } else {
                        console.log('[DailyImport] Phase 3: no due phrases found for any user');
                    }
                }
            }
        } catch (error) {
            console.error('[DailyImport] Phase 3 (feed quiz batch) failed:', error);
        }
    } else {
        console.log('[DailyImport] Phase 3: skipped (no Grok articles key set)');
    }

    // ═══ PHASE 4: SUBMIT PRACTICE ARTICLE BATCH ═══

    let practiceArticleBatchId: string | null = null;
    let practiceArticleRequestCount = 0;

    if (hasKey) {
        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const batchDocId = safeDocId(`practicearticles_${dateStr}`);

            const alreadyExists = await isBatchAlreadyCreatedToday(batchDocId, 'practice_article_generation');
            if (alreadyExists) {
                console.log(`[DailyImport] Phase 4: skipped (practice article batch already exists for today)`);
            } else {
                const users = await queryCollection('users', { limit: 100 });
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const tomorrowEnd = new Date(tomorrow);
                tomorrowEnd.setHours(23, 59, 59, 999);

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
                        const allPhrases = await runQuery('savedPhrases', [
                            { field: 'userId', op: 'EQUAL', value: userId }
                        ], 50);

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

                        const listeningPhrases = tomorrowDue
                            .filter(p => ((p.learningStep as number) || 0) > 0)
                            .slice(0, 20);

                        if (listeningPhrases.length === 0) continue;

                        const phrasesForBatch: PhraseForBatch[] = listeningPhrases.map(p => ({
                            id: p.id as string,
                            phrase: p.phrase as string,
                            meaning: p.meaning as string | undefined,
                            register: p.register as string | undefined,
                            topics: p.topics as string[] | undefined,
                            learningStep: (p.learningStep as number) || 1,
                        }));

                        const clusters = clusterPhrasesByTopic(phrasesForBatch);
                        const weakTypes = await getWeakestTypes(userId);
                        const PLATFORMS = ['linkedin', 'whatsapp', 'twitter', 'reddit', 'email', 'cover_letter', 'yelp_review', 'news_oped'];
                        const sourcePlatform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
                        
                        const req = buildPracticeArticleBatchRequest(userId, phrasesForBatch, clusters, weakTypes, sourcePlatform);
                        allArticleRequests.push(req);
                        userPhraseMap[userId] = listeningPhrases.map(p => p.id as string);

                    } catch (err) {
                        console.error(`[DailyImport] Practice article query failed for user ${userId}:`, err);
                    }
                }

                if (allArticleRequests.length > 0) {
                    // Claim the slot FIRST
                    await setDocument('batchJobs', batchDocId, {
                        name: `practice_articles_${dateStr}`,
                        provider: 'grok',
                        type: 'practice_article_generation',
                        status: 'creating',
                        batchId: 'pending',
                        requestCount: allArticleRequests.length,
                        submittedAt: new Date().toISOString(),
                    });

                    practiceArticleBatchId = await createBatch(`practice_articles_${dateStr}`, 'exercises');
                    await addBatchRequests(practiceArticleBatchId, allArticleRequests, 'exercises');
                    practiceArticleRequestCount = allArticleRequests.length;

                    await updateDocument('batchJobs', batchDocId, {
                        batchId: practiceArticleBatchId,
                        status: 'submitted',
                    });

                    console.log(`[DailyImport] Phase 4: submitted ${allArticleRequests.length} practice article requests to batch ${practiceArticleBatchId}`);
                } else {
                    console.log('[DailyImport] Phase 4: no listening-day users with due phrases');
                }
            }
        } catch (error) {
            console.error('[DailyImport] Phase 4 (practice article batch) failed:', error);
        }
    } else {
        console.log('[DailyImport] Phase 4: skipped (no Grok articles key set)');
    }

    return {
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
    };
}
