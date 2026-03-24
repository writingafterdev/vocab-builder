import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, addDocument, setDocument } from '@/lib/appwrite/database';
import { QuestionResult } from '@/lib/db/practice-types';
import { SavedPhrase, DEFAULT_LEARNING_CYCLE } from '@/lib/db/types';

interface UpdateResultRequest {
    phraseId: string;
    childId?: string;
    result: QuestionResult;
    isFast: boolean;
    practiceConfig?: {
        register: any;
        relationship: any;
        topic: string;
    };
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate user
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: UpdateResultRequest = await request.json();
        const { phraseId, childId, result, isFast, practiceConfig } = body;

        if (!phraseId || !result) {
            return NextResponse.json(
                { error: 'phraseId and result required' },
                { status: 400 }
            );
        }

        // Get the phrase from GLOBAL savedPhrases collection (NOT subcollection)
        // The main app stores phrases at /savedPhrases with a userId field
        const collectionPath = 'savedPhrases';
        let phrase: SavedPhrase;

        try {
            const doc = await getDocument(collectionPath, phraseId);
            if (!doc) {
                return NextResponse.json({ error: 'Phrase not found' }, { status: 404 });
            }
            phrase = doc as unknown as SavedPhrase;
        } catch (e) {
            console.error('Error fetching phrase:', e);
            return NextResponse.json({ error: 'Phrase not found' }, { status: 404 });
        }

        // --- CORE SRS LOGIC (Server-Side Implementation) ---

        const currentStep = phrase.learningStep || 0;
        const { intervals } = DEFAULT_LEARNING_CYCLE;

        let newStep: number;
        let nextReviewDate: Date;

        if (result === 'correct') {
            newStep = Math.min(currentStep + 1, intervals.length);
        } else if (result === 'wrong' || result === 'revealed') {
            newStep = Math.max(0, currentStep - 1);
        } else {
            // partial/skipped: maintain interval
            newStep = currentStep;
        }

        // Calculate next date
        const daysToAdd = intervals[Math.min(newStep, intervals.length - 1)] || 1;
        nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + daysToAdd);

        // Update phrase stats
        const updates: Record<string, any> = {
            learningStep: newStep,
            nextReviewDate: nextReviewDate, // Pass Date object for timestamp
            lastPracticedDate: new Date(),
            practiceCount: (phrase.practiceCount || 0) + 1,
            // Store last practice config for context rotation
            lastPracticeConfig: practiceConfig,
        };

        // Append to practiceHistory.usedContexts for per-phrase topic tracking
        // This ensures next practice session uses a DIFFERENT topic/scenario
        if (practiceConfig?.topic) {
            const existingHistory = phrase.practiceHistory || { usedContexts: [] };
            const newContext = {
                topic: practiceConfig.topic,
                register: practiceConfig.register || '',
                timestamp: new Date().toISOString(),
            };
            updates['practiceHistory'] = {
                usedContexts: [...existingHistory.usedContexts, newContext]
            };
        }
        await updateDocument(collectionPath, phraseId, updates);

        // Record history
        await addDocument(`users/${userId}/practiceHistory`, {
            phraseId,
            result,
            timestamp: new Date(),
            previousStep: currentStep,
            newStep,
            timeTaken: isFast ? 1 : 5,
            isFast,
            userId,
            ...practiceConfig
        });

        // Track weaknesses for Daily Drill
        if (result === 'wrong' || result === 'partial' || result === 'revealed') {
            await setDocument(`users/${userId}/weaknesses`, phraseId, {
                phraseId,
                phrase: phrase.phrase,
                topic: practiceConfig?.topic || phrase.topic || 'general',
                lastFailedAt: new Date(),
                failCount: (phrase.practiceCount || 0) + 1,
                register: phrase.register,
                nuance: phrase.nuance
            });
        }

        // --- CASCADING TRIGGER ---
        // Unlock 2 children when the parent is correctly answered
        if (result === 'correct' && phrase.children && phrase.children.length > 0) {
            try {
                const lockedChildren = phrase.children.filter((c: any) => c.nextReviewDate === null);

                if (lockedChildren.length > 0) {
                    const toUnlock = lockedChildren.slice(0, 2);
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(0, 0, 0, 0);

                    const updatedChildren = phrase.children.map((c: any) => {
                        if (toUnlock.find((u: any) => u.id === c.id)) {
                            return {
                                ...c,
                                nextReviewDate: tomorrow.toISOString(), // Unlock: Schedule for tomorrow
                                learningStep: 0
                            };
                        }
                        return c;
                    });

                    await updateDocument(collectionPath, phraseId, { children: updatedChildren });
                    console.log(`Unlocked ${toUnlock.length} children for phrase ${phraseId}`);
                }
            } catch (err) {
                console.error('Failed to execute cascading algorithm for children:', err);
                // Don't fail the main request if this side-effect fails
            }
        }

        // ---------------------------------------------------

        return NextResponse.json({
            success: true,
            message: 'Practice result updated',
            newStep,
            nextReviewDate
        });

    } catch (error) {
        console.error('Update practice result error:', error);
        return NextResponse.json(
            { error: 'Failed to update practice result' },
            { status: 500 }
        );
    }
}
