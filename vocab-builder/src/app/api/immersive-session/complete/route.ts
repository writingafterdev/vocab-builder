import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { setDocument, getDocument } from '@/lib/firestore-rest';
import { advanceSRS } from '@/lib/db/srs';

/**
 * Complete an Immersive Mode session
 * Updates phrase learning steps based on performance
 */
export async function POST(request: NextRequest) {
    try {
        // Auth
        const authHeader = request.headers.get('authorization');
        const userIdHeader = request.headers.get('x-user-id');

        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = await verifyIdToken(token);
                if (decoded) {
                    userId = decoded.uid;
                }
            } catch {
                console.log('[Immersive Complete] Token verification failed, using header');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { phrases, correctCount, totalQuestions, mode, xpEarned } = body;

        // Calculate success rate
        const successRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;
        const success = successRate >= 0.7;

        // Update each phrase's learning progress
        const updates = [];
        for (const phrase of phrases) {
            try {
                const doc = await getDocument('savedPhrases', phrase.id);
                if (!doc) continue;

                const currentStep = (doc as any).learningStep || 0;
                const currentInterval = (doc as any).interval || 1;
                const currentEaseFactor = (doc as any).easeFactor || 2.5;

                // Use advanceSRS to calculate new values
                const srsResult = advanceSRS(
                    currentStep,
                    currentInterval,
                    currentEaseFactor,
                    success
                );

                await setDocument('savedPhrases', phrase.id, {
                    ...(doc as object),
                    learningStep: srsResult.newStep,
                    interval: srsResult.newInterval,
                    easeFactor: srsResult.newEaseFactor,
                    nextReviewDate: srsResult.nextReviewDate.toISOString(),
                    lastImmersiveMode: mode,
                    lastImmersiveDate: new Date().toISOString(),
                });

                updates.push({
                    phraseId: phrase.id,
                    phrase: phrase.phrase,
                    previousStep: currentStep,
                    newStep: srsResult.newStep,
                    nextReviewDate: srsResult.nextReviewDate.toISOString(),
                });
            } catch (err) {
                console.error(`Failed to update phrase ${phrase.id}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            successRate,
            xpEarned: xpEarned || Math.round(successRate * 50),
            phrasesUpdated: updates.length,
            updates,
        });
    } catch (error) {
        console.error('[Immersive Complete] Error:', error);
        return NextResponse.json(
            { error: 'Failed to complete session' },
            { status: 500 }
        );
    }
}
