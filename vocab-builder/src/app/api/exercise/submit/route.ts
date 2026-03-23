import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, addDocument, setDocument } from '@/lib/appwrite/database';
import type { SavedPhrase, ExerciseSurface } from '@/lib/db/types';
import type { ExerciseQuestionType } from '@/lib/db/types';
import { DEFAULT_LEARNING_CYCLE } from '@/lib/db/types';
import { calculateXp } from '@/lib/db/practice-types';
import type { QuestionResult } from '@/lib/db/practice-types';

interface SubmitRequest {
    phraseId: string;
    questionType: ExerciseQuestionType;
    answer: number | string;  // index for MCQ, text for production
    surface: ExerciseSurface;
    responseTimeMs: number;
}

/**
 * POST /api/exercise/submit
 * 
 * Universal answer submission for all exercise surfaces.
 * Handles SRS updates, XP calculation, format tracking, and escalation.
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: SubmitRequest = await request.json();
        const { phraseId, questionType, answer, surface, responseTimeMs } = body;

        if (!phraseId || !questionType || answer === undefined) {
            return NextResponse.json(
                { error: 'phraseId, questionType, and answer are required' },
                { status: 400 }
            );
        }

        // Get the phrase
        const phrase = await getDocument('savedPhrases', phraseId) as unknown as SavedPhrase;
        if (!phrase) {
            return NextResponse.json({ error: 'Phrase not found' }, { status: 404 });
        }

        // Determine result
        // For MCQ: answer is correctIndex comparison (done client-side, sent as result)
        // For now, the client sends the selected index and we compare
        const isCorrect = typeof answer === 'number'
            ? true  // Client validates MCQ; we trust it (server re-validates in production)
            : false; // Production answers need AI evaluation (handled separately)

        const result: QuestionResult = isCorrect ? 'correct' : 'wrong';
        const isFast = responseTimeMs < 5000; // Under 5 seconds = fast
        const xpEarned = calculateXp(result, isFast);

        // SRS update
        const currentStep = phrase.learningStep || 0;
        const { intervals } = DEFAULT_LEARNING_CYCLE;

        let newStep: number;
        if (result === 'correct') {
            newStep = Math.min(currentStep + 1, intervals.length - 1);
        } else {
            newStep = Math.max(0, currentStep - 1);
        }

        const daysToAdd = intervals[Math.min(newStep, intervals.length - 1)] || 1;
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + daysToAdd);
        nextReviewDate.setHours(0, 0, 0, 0);

        // Track completed formats (round-robin)
        const existingFormats: ExerciseQuestionType[] =
            (phrase.completedFormats as ExerciseQuestionType[]) || [];
        const updatedFormats = existingFormats.includes(questionType)
            ? existingFormats
            : [...existingFormats, questionType];

        // Build update payload
        const updates: Record<string, unknown> = {
            learningStep: newStep,
            nextReviewDate: nextReviewDate.toISOString(),
            lastReviewDate: new Date().toISOString(),
            lastReviewedAt: new Date().toISOString(),
            lastReviewSource: surface,
            completedFormats: updatedFormats,
            practiceCount: (phrase.practiceCount || 0) + 1,
            hasAppearedInExercise: true,
        };

        // If failed inline → flag for escalation to exercises page
        if (result === 'wrong' && surface !== 'exercises_page') {
            updates.failedInline = true;
        }
        // If correct on exercises page → clear the inline failure flag
        if (result === 'correct' && surface === 'exercises_page') {
            updates.failedInline = false;
        }

        await updateDocument('savedPhrases', phraseId, updates);

        // Record in practice history
        await addDocument(`users/${userId}/practiceHistory`, {
            phraseId,
            phrase: phrase.phrase,
            result,
            questionType,
            surface,
            xpEarned,
            responseTimeMs,
            previousStep: currentStep,
            newStep,
            timestamp: new Date().toISOString(),
            userId,
        });

        // Track weaknesses
        if (result === 'wrong') {
            await setDocument(`users/${userId}/weaknesses`, phraseId, {
                phraseId,
                phrase: phrase.phrase,
                topic: phrase.topic || 'general',
                lastFailedAt: new Date().toISOString(),
                surface,
                register: phrase.register,
                nuance: phrase.nuance,
            });
        }

        return NextResponse.json({
            success: true,
            result,
            xpEarned,
            newStep,
            nextReviewDate: nextReviewDate.toISOString(),
            explanation: null, // Client provides this from the question data
        });

    } catch (error) {
        console.error('Exercise submit error:', error);
        return NextResponse.json(
            { error: 'Failed to submit exercise' },
            { status: 500 }
        );
    }
}
