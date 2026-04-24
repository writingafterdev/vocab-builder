import { NextRequest, NextResponse } from 'next/server';
import { getQuoteFeedState } from '@/lib/db/quote-feed';
import { getRequestUser } from '@/lib/request-auth';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const state = await getQuoteFeedState(userId);
        
        return NextResponse.json({ topicScores: state.topicScores || {} });
    } catch (error) {
        console.error('Error fetching topic scores:', error);
        return NextResponse.json({ error: 'Failed to fetch topic scores' }, { status: 500 });
    }
}
