import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/firebase-admin';
import { getQuoteFeedState } from '@/lib/db/quote-feed';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

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
