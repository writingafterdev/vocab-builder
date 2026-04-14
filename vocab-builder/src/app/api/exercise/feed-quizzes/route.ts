import { NextRequest, NextResponse } from 'next/server';
import { getDocument, safeDocId } from '@/lib/appwrite/database';

export async function GET(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const docId = safeDocId(`${dateStr}_${userId}`);

        try {
            const doc = await getDocument('feedQuizzes', docId) as any;
            if (doc && doc.cards) {
                return NextResponse.json({ quizzes: doc.cards });
            }
        } catch (error: any) {
            // Document might not exist if batch hasn't run or completed yet
            if (error?.code !== 404) {
                console.error('[FeedQuizzes] Error fetching pre-generated quizzes:', error);
            }
        }

        return NextResponse.json({ quizzes: [] });
    } catch (error) {
        console.error('[FeedQuizzes] API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
