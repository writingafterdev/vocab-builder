/**
 * GET /api/daily-drill/weaknesses
 * Get user's weaknesses eligible for daily drill
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getDrillEligibleWeaknesses, getWeaknessStats } from '@/lib/db/user-weaknesses';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyIdToken(token);
        if (!decodedToken) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        const userId = decodedToken.uid;

        const [eligible, stats] = await Promise.all([
            getDrillEligibleWeaknesses(userId),
            getWeaknessStats(userId)
        ]);

        return NextResponse.json({
            eligible,
            stats,
            hasDrills: eligible.length > 0
        });

    } catch (error) {
        console.error('[Daily Drill Weaknesses] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get weaknesses' },
            { status: 500 }
        );
    }
}
