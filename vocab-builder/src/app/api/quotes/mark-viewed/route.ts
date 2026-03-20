import { NextRequest, NextResponse } from 'next/server';
import { markQuotesViewed, boostTopic } from '@/lib/db/quote-feed';

/**
 * POST /api/quotes/mark-viewed
 * 
 * Batch mark quotes as viewed + optionally boost a topic
 * Called from QuoteSwiper on swipe (batched) or component unmount
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const authHeader = request.headers.get('Authorization');
        const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

        const body = await request.json();
        const { quoteIds, boostTopicName } = body as {
            quoteIds?: string[];
            boostTopicName?: string;
        };

        // Mark quotes as viewed
        if (quoteIds && quoteIds.length > 0) {
            await markQuotesViewed(userId, quoteIds, idToken);
        }

        // Boost topic if provided (triggered by ❤️ save)
        if (boostTopicName) {
            await boostTopic(userId, boostTopicName, idToken);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error marking quotes viewed:', error);
        return NextResponse.json({ error: 'Failed to mark viewed' }, { status: 500 });
    }
}
