import { NextRequest, NextResponse } from 'next/server';
import { updateDocument, serverTimestamp } from '@/lib/appwrite/database';
import { updateSkillProgress } from '@/lib/db/skill-progress';

/**
 * POST /api/practice/complete-session
 * Marks a session as completed and updates SRS for reviewed phrases
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { sessionId, phraseIds, correctCount, totalQuestions } = await request.json();

        if (!sessionId || !phraseIds) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { getDocument, setDocument } = await import('@/lib/appwrite/database');
        const session = await getDocument('generatedSessions', sessionId);

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const isOwner = session.userId === userId;
        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

        if (isOwner) {
            // 1. Mark session as completed for the owner
            await updateDocument('generatedSessions', sessionId, {
                status: 'completed',
                completedAt: serverTimestamp(),
                results: {
                    correctCount,
                    totalQuestions,
                    accuracy,
                },
            });

            // 2. Update SRS for all phrases reviewed in this session
            try {
                const performance = totalQuestions > 0 ? correctCount / totalQuestions : 0.5;

                for (const phraseId of phraseIds) {
                    await updateDocument('savedPhrases', phraseId, {
                        lastReviewedAt: serverTimestamp(),
                        lastReviewSource: 'generated_session',
                    });
                }

                // Update skill progress
                await updateSkillProgress(
                    userId,
                    'exercise',
                    performance,
                    `Generated session: ${correctCount}/${totalQuestions} correct`
                );
            } catch (srsError) {
                console.error('SRS update error (non-fatal):', srsError);
            }
        } else {
            // Extension C: Public Verification
            // Non-owners taking the quiz helps verify the content and gives them practice.
            // We do NOT update their SRS (since these probably aren't their active phrases),
            // and we do NOT mark the original session as 'completed' for the owner.
            await setDocument('communityAttempts', `${sessionId}_${userId}`, {
                sessionId,
                userId,
                correctCount,
                totalQuestions,
                accuracy,
                completedAt: serverTimestamp(),
            });
        }

        return NextResponse.json({
            success: true,
            accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
        });

    } catch (error) {
        console.error('Complete session error:', error);
        return NextResponse.json(
            { error: 'Failed to complete session' },
            { status: 500 }
        );
    }
}
