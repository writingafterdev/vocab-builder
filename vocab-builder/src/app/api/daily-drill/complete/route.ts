/**
 * POST /api/daily-drill/complete
 * Submit drill result and update weakness improvement score
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { updateWeaknessAfterDrill } from '@/lib/db/user-weaknesses';
import { getDocument, updateDocument } from '@/lib/firestore-rest';
import { Timestamp } from 'firebase/firestore';
import { awardXp } from '@/lib/xp';

export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { sessionId, drillId, weaknessId, correct, performance } = body;

        if (!weaknessId) {
            return NextResponse.json({ error: 'Missing weaknessId' }, { status: 400 });
        }

        // Calculate performance score (0-100)
        const score = correct ? (performance || 100) : (performance || 20);

        // Update weakness improvement score
        await updateWeaknessAfterDrill(userId, weaknessId, score);

        // Update session if provided
        if (sessionId) {
            try {
                const session = await getDocument('drillSessions', sessionId);
                if (session) {
                    const drills = (session as any).drills || [];
                    const updatedDrills = drills.map((d: any) => {
                        if (d.id === drillId) {
                            return { ...d, completed: true, correct, performance: score };
                        }
                        return d;
                    });

                    const allCompleted = updatedDrills.every((d: any) => d.completed);

                    await updateDocument('drillSessions', sessionId, {
                        drills: updatedDrills,
                        completed: allCompleted,
                        completedAt: allCompleted ? Timestamp.now() : null
                    });
                }
            } catch (err) {
                console.error('[Daily Drill Complete] Session update failed:', err);
            }
        }

        // Award XP for completing drill
        const xpResult = await awardXp(userId, 'daily_drill_complete', {
            sessionId,
            score
        });

        return NextResponse.json({
            success: true,
            improvementScore: score,
            xp: xpResult
        });

    } catch (error) {
        console.error('[Daily Drill Complete] Error:', error);
        return NextResponse.json(
            { error: 'Failed to complete drill' },
            { status: 500 }
        );
    }
}
