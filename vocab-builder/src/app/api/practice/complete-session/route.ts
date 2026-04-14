import { NextRequest, NextResponse } from 'next/server';
import { updateDocument, serverTimestamp, getDocument, setDocument } from '@/lib/appwrite/database';
import { updateSkillProgress } from '@/lib/db/skill-progress';
import { recordResult } from '@/lib/db/question-weaknesses';
import { unlockChildren } from '@/lib/db/srs';
import type { SessionQuestionResult } from '@/lib/db/types';

/**
 * POST /api/practice/complete-session
 * Marks a session as completed, records per-question results,
 * updates SRS for reviewed phrases, and tracks weaknesses.
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            sessionId,
            phraseIds,
            results,        // SessionQuestionResult[]
            correctCount,   // total correct (fallback for legacy)
            totalQuestions,  // total questions (fallback for legacy)
        } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const session = await getDocument('generatedSessions', sessionId) as any;

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const isOwner = session.userId === userId;

        // Calculate accuracy from results array or fallback values
        const questionResults: SessionQuestionResult[] = results || [];
        const actualCorrect = questionResults.length > 0
            ? questionResults.filter((r: SessionQuestionResult) => r.correct).length
            : (correctCount || 0);
        const actualTotal = questionResults.length > 0
            ? questionResults.length
            : (totalQuestions || 0);
        const accuracy = actualTotal > 0 ? Math.round((actualCorrect / actualTotal) * 100) : 0;

        if (isOwner) {
            // 1. Mark session as completed with results
            await updateDocument('generatedSessions', sessionId, {
                status: `completed_${accuracy}pct`,
                results: JSON.stringify(questionResults),
                createdAt: serverTimestamp(), // repurpose as last-updated
            });

            // 2. Record per-question-type weaknesses
            for (const result of questionResults) {
                try {
                    await recordResult(
                        userId,
                        result.type,
                        result.correct,
                        {
                            sessionId,
                            userAnswer: result.userAnswer,
                        }
                    );
                } catch (weakErr) {
                    console.warn('Weakness recording error (non-fatal):', weakErr);
                }
            }

            // 3. Update SRS for phrases — with per-phrase production tracking
            const vocabIds = phraseIds || [];
            try {
                const performance = actualTotal > 0 ? actualCorrect / actualTotal : 0.5;

                // Collect per-phrase production results from freewrite questions
                const productionPhraseResults: Record<string, 'natural' | 'forced' | 'missing'> = {};
                for (const result of questionResults) {
                    if (result.phraseUsageResults && Array.isArray(result.phraseUsageResults)) {
                        for (const pur of result.phraseUsageResults) {
                            // Per-phrase granular outcome
                            productionPhraseResults[pur.phraseId] = pur.usageQuality;
                        }
                    }
                }

                const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 90];

                for (const phraseId of vocabIds) {
                    const updates: any = {
                        lastReviewedAt: serverTimestamp(),
                        lastReviewSource: 'session',
                    };

                    // Check if this phrase has production-specific results
                    const productionResult = productionPhraseResults[phraseId];

                    if (productionResult) {
                        // ── Production-level SRS: per-phrase granular ──
                        try {
                            const phraseDoc = await getDocument('savedPhrases', phraseId) as any;
                            if (phraseDoc) {
                                const currentStep = phraseDoc.learningStep || 0;
                                if (productionResult === 'natural') {
                                    // Used naturally → advance SRS
                                    updates.learningStep = Math.min(currentStep + 1, DEFAULT_INTERVALS.length - 1);
                                } else if (productionResult === 'forced') {
                                    // Used but forced → stay at same step
                                    updates.learningStep = currentStep;
                                } else {
                                    // Missing → step back
                                    updates.learningStep = Math.max(0, currentStep - 1);
                                }
                                // Recalculate next review date
                                const nextInterval = DEFAULT_INTERVALS[updates.learningStep] || 1;
                                const nextDate = new Date();
                                nextDate.setDate(nextDate.getDate() + nextInterval);
                                nextDate.setHours(0, 0, 0, 0);
                                updates.nextReviewDate = nextDate.toISOString();
                            }
                        } catch (e) {
                            // Ignore fetch errors
                        }
                    } else {
                        // ── Non-production: overall performance-based ──
                        try {
                            const phraseDoc = await getDocument('savedPhrases', phraseId) as any;
                            if (phraseDoc) {
                                const currentStep = phraseDoc.learningStep || 0;
                                if (performance >= 0.75) {
                                    // Good session → advance SRS
                                    updates.learningStep = Math.min(currentStep + 1, DEFAULT_INTERVALS.length - 1);
                                } else if (performance < 0.4) {
                                    // Poor session → step back
                                    updates.learningStep = Math.max(0, currentStep - 1);
                                } else {
                                    // Mediocre → hold step
                                    updates.learningStep = currentStep;
                                }
                                // Always recalculate nextReviewDate
                                const nextInterval = DEFAULT_INTERVALS[updates.learningStep] || 1;
                                const nextDate = new Date();
                                nextDate.setDate(nextDate.getDate() + nextInterval);
                                nextDate.setHours(0, 0, 0, 0);
                                updates.nextReviewDate = nextDate.toISOString();
                            }
                        } catch (e) {
                            // Ignore fetch errors — phrase may have been deleted
                        }
                    }

                    await updateDocument('savedPhrases', phraseId, updates);

                    if (performance >= 0.75 || productionResult === 'natural') {
                        try {
                            await unlockChildren(phraseId, 2);
                        } catch (e) {
                            console.error('Failed to unlock children:', e);
                        }
                    }
                }

                // Update skill progress
                await updateSkillProgress(
                    userId,
                    'exercise',
                    performance,
                    `Session: ${actualCorrect}/${actualTotal} correct`
                );
            } catch (srsError) {
                console.error('SRS update error (non-fatal):', srsError);
            }
        } else {
            // Community verification (non-owners)
            try {
                await setDocument('communityAttempts', `${sessionId}_${userId}`, {
                    sessionId,
                    userId,
                    correctCount: actualCorrect,
                    totalQuestions: actualTotal,
                    accuracy,
                    completedAt: serverTimestamp(),
                });
            } catch (e) {
                console.warn('communityAttempts write failed (non-fatal):', e);
            }
        }

        // Calculate per-module breakdown for the response
        const moduleBreakdown: Record<string, { correct: number; total: number }> = {};
        for (const result of questionResults) {
            const axis = result.skillAxis || 'unknown';
            if (!moduleBreakdown[axis]) {
                moduleBreakdown[axis] = { correct: 0, total: 0 };
            }
            moduleBreakdown[axis].total++;
            if (result.correct) moduleBreakdown[axis].correct++;
        }

        return NextResponse.json({
            success: true,
            accuracy,
            moduleBreakdown,
            weaknessesRecorded: questionResults.filter(r => !r.correct).length,
        });

    } catch (error) {
        console.error('Complete session error:', error);
        return NextResponse.json(
            { error: 'Failed to complete session' },
            { status: 500 }
        );
    }
}
