import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';
import type { XpTransaction } from '@/types';

/**
 * GET /api/user/xp-history
 * Fetch XP transaction history for user
 */

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');

        // Query transactions for this user
        const transactions = await runQuery(
            'xpTransactions',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            Math.min(limit, 100)
        );

        // Sort by date descending (newest first)
        const sorted = transactions.sort((a, b) => {
            const dateA = new Date(a.createdAt as string).getTime();
            const dateB = new Date(b.createdAt as string).getTime();
            return dateB - dateA;
        });

        return NextResponse.json({
            success: true,
            transactions: sorted,
            count: sorted.length
        });

    } catch (error) {
        console.error('[XP] Error fetching history:', error);
        return NextResponse.json(
            { error: 'Failed to fetch XP history' },
            { status: 500 }
        );
    }
}
