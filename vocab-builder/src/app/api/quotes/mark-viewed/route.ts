import { NextRequest, NextResponse } from 'next/server';
import { markQuotesViewed, boostTopic } from '@/lib/db/quote-feed';
import { markNativeFeedViewed } from '@/lib/db/native-vocabulary';
import { getRequestUser } from '@/lib/request-auth';

/**
 * POST /api/quotes/mark-viewed
 * 
 * Batch mark quotes as viewed + optionally boost a topic.
 * Supports dwell-time signals for implicit preference learning:
 *   - dwellSignals: Array<{ topic, weight }> derived from swipe timing
 *     weight > 0 = lingered (interested), weight < 0 = quick skip (not interested)
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const authHeader = request.headers.get('Authorization');
        const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

        const body = await request.json();
        const { quoteIds, nativeWordKeys, nativeFollowupKeys, boostTopicName, boostTags, dwellSignals } = body as {
            quoteIds?: string[];
            nativeWordKeys?: string[];
            nativeFollowupKeys?: string[];
            boostTopicName?: string;
            boostTags?: string[];
            dwellSignals?: Array<{ topic: string; weight: number; tags?: string[] }>;
        };

        // Mark quotes as viewed
        if (quoteIds && quoteIds.length > 0) {
            await markQuotesViewed(userId, quoteIds, idToken);
        }

        if ((nativeWordKeys && nativeWordKeys.length > 0) || (nativeFollowupKeys && nativeFollowupKeys.length > 0)) {
            await markNativeFeedViewed(userId, nativeWordKeys || [], nativeFollowupKeys || []);
        }

        // Boost topic and tags if provided (triggered by ❤️ save)
        if (boostTopicName || (boostTags && boostTags.length > 0)) {
            await boostTopic(userId, boostTopicName || 'general', 1, idToken, boostTags || []);
        }

        // Process dwell-time signals (implicit preference learning)
        // These are batched — multiple signals per flush to minimize API calls
        if (dwellSignals && dwellSignals.length > 0) {
            // Aggregate signals by topic to minimize DB writes
            const aggregated: Record<string, { weight: number; tags: string[] }> = {};
            for (const signal of dwellSignals) {
                if (!signal.topic) continue;
                if (!aggregated[signal.topic]) {
                    aggregated[signal.topic] = { weight: 0, tags: [] };
                }
                aggregated[signal.topic].weight += signal.weight;
                if (signal.tags) {
                    aggregated[signal.topic].tags.push(...signal.tags);
                }
            }

            // Apply aggregated boosts (single DB write per topic)
            for (const [topic, { weight, tags }] of Object.entries(aggregated)) {
                if (Math.abs(weight) > 0.05) { // Skip negligible signals
                    await boostTopic(userId, topic, weight, idToken, tags);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error marking quotes viewed:', error);
        return NextResponse.json({ error: 'Failed to mark viewed' }, { status: 500 });
    }
}
