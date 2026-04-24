import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { getFeedCardsForUser } from '@/lib/exercise/shared-pool';

/**
 * Legacy feed-card generation alias.
 * Feed exercise cards now come from the shared Exercise V3 question pool.
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request);
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const forceRefill = body?.forceRefill === true;
        const cards = await getFeedCardsForUser(userId, forceRefill);

        return NextResponse.json({
            cards,
            source: 'shared_pool_v3',
        });
    } catch (error) {
        console.error('Legacy feed-card alias error:', error);
        return NextResponse.json({ error: 'Failed to load feed cards' }, { status: 500 });
    }
}
