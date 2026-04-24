import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { submitFeedAttempt } from '@/lib/exercise/shared-pool';
import type { LearningBand, QuestionType } from '@/lib/db/types';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            questionId,
            questionType,
            learningBand,
            testedPhraseIds,
            correct,
            userAnswer,
        } = body as {
            questionId?: string;
            questionType?: QuestionType;
            learningBand?: LearningBand;
            testedPhraseIds?: string[];
            correct?: boolean;
            userAnswer?: string;
        };

        if (!questionId || typeof correct !== 'boolean') {
            return NextResponse.json({ error: 'Missing questionId or correctness' }, { status: 400 });
        }

        await submitFeedAttempt({
            userId,
            questionId,
            questionType,
            learningBand,
            testedPhraseIds,
            correct,
            userAnswer,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[exercise/submit] Failed:', error);
        return NextResponse.json({ error: 'Failed to record exercise attempt' }, { status: 500 });
    }
}
