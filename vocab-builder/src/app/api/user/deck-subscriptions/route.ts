import { NextRequest, NextResponse } from 'next/server';
import { listDecks } from '@/lib/db/decks';
import {
    getUserSubscriptions,
    subscribeToDeck,
    unsubscribeFromDeck,
} from '@/lib/db/decks';

/**
 * GET /api/user/deck-subscriptions?userId=xxx
 * Returns all active decks + which ones the user is subscribed to
 */
export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get('userId');
        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        const [allDecks, userSubs] = await Promise.all([
            listDecks('active'),
            getUserSubscriptions(userId),
        ]);

        const subscribedIds = new Set(userSubs.map(s => s.deckId));

        return NextResponse.json({
            decks: allDecks.map(d => ({
                ...d,
                isSubscribed: subscribedIds.has(d.id),
            })),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/user/deck-subscriptions
 * Body: { userId, deckId, action: 'subscribe' | 'unsubscribe' }
 */
export async function POST(request: NextRequest) {
    try {
        const { userId, deckId, action } = await request.json();
        if (!userId || !deckId || !action) {
            return NextResponse.json({ error: 'userId, deckId, action required' }, { status: 400 });
        }

        if (action === 'subscribe') {
            await subscribeToDeck(userId, deckId);
        } else {
            await unsubscribeFromDeck(userId, deckId);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
