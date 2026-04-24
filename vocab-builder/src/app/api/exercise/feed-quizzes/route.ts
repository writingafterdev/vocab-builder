import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { getFeedCardsForUser } from '@/lib/exercise/shared-pool';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const forceRefill = request.nextUrl.searchParams.get('refill') === '1';
        const quizzes = await getFeedCardsForUser(userId, forceRefill);
        return NextResponse.json({ quizzes });
    } catch (error) {
        console.error('[FeedQuizzes] API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
