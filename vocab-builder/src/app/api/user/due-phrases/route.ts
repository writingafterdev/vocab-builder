import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';

// Force dynamic since we check SRS dates relative to "now"
export const dynamic = 'force-dynamic';

// ============================================================================
// TYPES
// ============================================================================

interface DuePhrase {
    id: string;
    phrase: string;
    topic?: string | string[];
    subtopic?: string | string[];
    register?: string | string[];
    nuance?: string | string[];
    nextReviewDate: Date;
    reviewCount?: number;
    [key: string]: unknown;
}

interface PhraseCluster {
    topic: string;
    subtopic?: string;
    phrases: DuePhrase[];
}

// ============================================================================
// CLUSTERING HELPERS
// ============================================================================

/**
 * Get primary topic from phrase (first in array or string value)
 */
function getPrimaryTopic(phrase: DuePhrase): string {
    const topic = phrase.topic;
    if (!topic) return 'general';
    if (Array.isArray(topic)) return topic[0] || 'general';
    return topic;
}

/**
 * Get primary subtopic from phrase
 */
function getPrimarySubtopic(phrase: DuePhrase): string | undefined {
    const subtopic = phrase.subtopic;
    if (!subtopic) return undefined;
    if (Array.isArray(subtopic)) return subtopic[0];
    return subtopic;
}

/**
 * Create cluster key from topic + subtopic
 */
function getClusterKey(phrase: DuePhrase): string {
    const topic = getPrimaryTopic(phrase);
    const subtopic = getPrimarySubtopic(phrase);
    return subtopic ? `${topic}/${subtopic}` : topic;
}

/**
 * Group phrases by topic/subtopic into clusters
 */
function clusterPhrasesByTopic(phrases: DuePhrase[]): Map<string, PhraseCluster> {
    const clusters = new Map<string, PhraseCluster>();

    for (const phrase of phrases) {
        const key = getClusterKey(phrase);
        const topic = getPrimaryTopic(phrase);
        const subtopic = getPrimarySubtopic(phrase);

        if (clusters.has(key)) {
            clusters.get(key)!.phrases.push(phrase);
        } else {
            clusters.set(key, {
                topic,
                subtopic,
                phrases: [phrase]
            });
        }
    }

    return clusters;
}

/**
 * Enrich small clusters by pulling similar phrases from user's vocab bank
 * If a cluster has only 1 phrase, find 1-2 more with same topic
 */
function enrichSmallClusters(
    clusters: Map<string, PhraseCluster>,
    allUserPhrases: DuePhrase[]
): Map<string, PhraseCluster> {
    const enriched = new Map(clusters);

    for (const [key, cluster] of enriched) {
        if (cluster.phrases.length >= 2) continue;

        // Find similar phrases from vocab bank (same topic, not due today)
        const existingIds = new Set(cluster.phrases.map(p => p.id));
        const similar = allUserPhrases
            .filter(p => {
                if (existingIds.has(p.id)) return false;
                const pTopic = getPrimaryTopic(p);
                return pTopic === cluster.topic;
            })
            .slice(0, 2); // Get up to 2 more

        if (similar.length > 0) {
            cluster.phrases.push(...similar);
        }
    }

    return enriched;
}

/**
 * Sort clusters to prioritize variety (avoid repeating recently practiced topics)
 * For now, just shuffle - can add topic history tracking later
 */
function sortClustersForVariety(clusters: PhraseCluster[]): PhraseCluster[] {
    // Shuffle clusters for variety
    const shuffled = [...clusters];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        // Secure authentication - verify Firebase ID token (edge-compatible)
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Fallback for backward compatibility or when testing
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // Fetch user phrases from GLOBAL savedPhrases collection
        const userPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            500
        );

        // ---------------------------------------------------------
        // 1. Process Root Phrases - Parse dates
        // ---------------------------------------------------------
        const allPhrases: DuePhrase[] = userPhrases.map(doc => {
            let reviewDate: Date;
            const d = doc.nextReviewDate as any;
            if (!d) reviewDate = new Date(0);
            else if (d.toDate) reviewDate = d.toDate();
            else if (d instanceof Date) reviewDate = d;
            else reviewDate = new Date(d);

            return { ...doc, nextReviewDate: reviewDate } as DuePhrase;
        });

        // Filter to due phrases only
        const duePhrases = allPhrases
            .filter(p => p.nextReviewDate <= endOfToday)
            .sort((a, b) => a.nextReviewDate.getTime() - b.nextReviewDate.getTime())
            .slice(0, 50);

        // ---------------------------------------------------------
        // 2. Cluster due phrases by topic/subtopic
        // ---------------------------------------------------------
        const clusters = clusterPhrasesByTopic(duePhrases);

        // ---------------------------------------------------------
        // 3. Enrich small clusters (size 1) with similar phrases
        // ---------------------------------------------------------
        const enrichedClusters = enrichSmallClusters(clusters, allPhrases);

        // ---------------------------------------------------------
        // 4. Sort clusters for topic variety
        // ---------------------------------------------------------
        const sortedClusters = sortClustersForVariety([...enrichedClusters.values()]);

        // ---------------------------------------------------------
        // 5. Process Child Expressions (Layer 1) - unchanged
        // ---------------------------------------------------------
        const dueChildren: any[] = [];

        for (const parentDoc of userPhrases) {
            if (dueChildren.length >= 20) break;

            const children = (parentDoc.children as any[]) || [];
            if (!children.length) continue;

            children.forEach(child => {
                let reviewDate: Date;
                const d = child.nextReviewDate as any;
                if (!d) reviewDate = new Date(0);
                else if (d.toDate) reviewDate = d.toDate();
                else if (d instanceof Date) reviewDate = d;
                else reviewDate = new Date(d);

                if (reviewDate <= endOfToday) {
                    dueChildren.push({
                        parentId: parentDoc.id,
                        parentPhrase: parentDoc.phrase,
                        child: child,
                        reviewMs: reviewDate.getTime()
                    });
                }
            });
        }

        dueChildren.sort((a, b) => a.reviewMs - b.reviewMs);
        const finalChildren = dueChildren.slice(0, 20).map(({ reviewMs, ...rest }) => rest);

        // ---------------------------------------------------------
        // 6. Return clustered results
        // ---------------------------------------------------------
        return NextResponse.json({
            count: duePhrases.length + finalChildren.length,
            // Original flat list (for backward compatibility)
            phrases: duePhrases,
            // NEW: Clustered phrases by topic
            clusters: sortedClusters.map(c => ({
                topic: c.topic,
                subtopic: c.subtopic,
                phraseCount: c.phrases.length,
                phrases: c.phrases.map(p => ({
                    id: p.id,
                    phrase: p.phrase,
                    register: p.register,
                    nuance: p.nuance,
                    reviewCount: p.reviewCount,
                }))
            })),
            children: finalChildren
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('Fetch due phrases CRITICAL ERROR:', errorMessage, errorStack);

        return NextResponse.json({
            error: 'Internal server error',
            details: errorMessage
        }, { status: 500 });
    }
}
