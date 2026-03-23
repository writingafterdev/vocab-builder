import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, addDocument } from '@/lib/appwrite/database';
import { XP_CONFIG, type UserStats, type Subscription } from '@/types';

/**
 * POST /api/user/redeem-xp
 * Redeem XP for premium subscription days
 */

interface RedeemRequest {
    days: 1 | 7 | 30;
}

// Get XP cost for days
function getXpCost(days: 1 | 7 | 30): number {
    switch (days) {
        case 1: return XP_CONFIG.REDEEM_1_DAY;
        case 7: return XP_CONFIG.REDEEM_7_DAYS;
        case 30: return XP_CONFIG.REDEEM_30_DAYS;
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: RedeemRequest = await request.json();
        const { days } = body;

        if (!days || ![1, 7, 30].includes(days)) {
            return NextResponse.json({ error: 'Invalid days. Must be 1, 7, or 30' }, { status: 400 });
        }

        const xpCost = getXpCost(days);

        // Get user profile
        const userData = await getDocument('users', userId);
        if (!userData) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const stats: UserStats = userData.stats as UserStats;
        const subscription: Subscription = userData.subscription as Subscription;

        // Check sufficient balance
        if (!stats.xp || stats.xp < xpCost) {
            return NextResponse.json({
                success: false,
                reason: 'insufficient_xp',
                required: xpCost,
                available: stats.xp || 0
            }, { status: 400 });
        }

        // Calculate new expiry date
        const now = new Date();
        let currentEnd = subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd)
            : now;

        // If subscription already expired, start from now
        if (currentEnd < now) {
            currentEnd = now;
        }

        // Add days
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + days);

        // Deduct XP and update subscription
        const newXp = stats.xp - xpCost;
        const newRedeemedDays = (stats.redeemedDays || 0) + days;

        await updateDocument('users', userId, {
            'stats.xp': newXp,
            'stats.redeemedDays': newRedeemedDays,
            'stats.level': Math.floor(newXp / XP_CONFIG.XP_PER_LEVEL) + 1,
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': newEnd.toISOString(),
            'subscription.paymentProvider': 'xp_redeem'
        });

        // Log transaction
        await addDocument('xpTransactions', {
            userId,
            amount: -xpCost,
            type: 'redeem',
            source: 'redeem_premium',
            createdAt: new Date().toISOString(),
            metadata: {
                daysRedeemed: days,
                newExpiryDate: newEnd.toISOString()
            }
        });

        console.log(`[XP] User ${userId} redeemed ${xpCost} XP for ${days} days premium`);

        return NextResponse.json({
            success: true,
            xpSpent: xpCost,
            daysAdded: days,
            newXpBalance: newXp,
            newExpiryDate: newEnd.toISOString(),
            totalRedeemedDays: newRedeemedDays
        });

    } catch (error) {
        console.error('[XP] Error redeeming XP:', error);
        return NextResponse.json(
            { error: 'Failed to redeem XP', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
