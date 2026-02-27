import { NextRequest, NextResponse } from 'next/server';
import { setDocument, serverTimestamp } from '@/lib/firestore-rest';
import { updateSkillProgress } from '@/lib/db/skill-progress';

/**
 * Save a completed exercise session to Firestore for later review
 * Sessions are stored per user and cluster, keyed by date to allow daily resets
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { session, date } = body;

        if (!session || !session.clusterId) {
            return NextResponse.json({ error: 'Invalid session data' }, { status: 400 });
        }

        // Create a unique document ID: userId_date_clusterId
        const dateKey = date || new Date().toISOString().split('T')[0];
        const docId = `${userId}_${dateKey}_${session.clusterId}`;

        // Store the session data
        await setDocument('completedSessions', docId, {
            userId,
            date: dateKey,
            clusterId: session.clusterId,
            session: session,
            savedAt: serverTimestamp()
        });

        // Update skill progress (retention + comprehension)
        const correctCount = session.answers?.filter((a: { correct: boolean }) => a.correct).length || 0;
        const totalCount = session.answers?.length || 1;
        const performance = correctCount / totalCount;
        await updateSkillProgress(userId, 'exercise', performance, `Exercise session with ${correctCount}/${totalCount} correct`);

        return NextResponse.json({ success: true, docId });

    } catch (error) {
        console.error('Error saving session:', error);
        return NextResponse.json(
            { error: 'Failed to save session' },
            { status: 500 }
        );
    }
}
