import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { getNextPracticeBatch } from '@/lib/exercise/shared-pool';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request);
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const batch = await getNextPracticeBatch(userId);
        if (!batch) {
            return NextResponse.json({
                error: 'No phrases due for review',
                suggestion: 'Keep reading and saving new phrases!',
            }, { status: 400 });
        }

        return NextResponse.json({
            sessionId: batch.sessionId,
            questionCount: batch.questions.length,
        });
    } catch (error) {
        console.error('[practice/generate-session-article] Failed:', error);
        return NextResponse.json({ error: 'Failed to prepare practice batch' }, { status: 500 });
    }
}
