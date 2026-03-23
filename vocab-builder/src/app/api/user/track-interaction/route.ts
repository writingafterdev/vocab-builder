import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/firebase-admin';
import { boostTopic } from '@/lib/db/quote-feed';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { postId, action, topic, tags } = body;

        if (!postId || !action) {
            return NextResponse.json({ error: 'Missing postId or action' }, { status: 400 });
        }

        // We specifically track topics and granular tags for the recommendation engine
        if (topic || tags) {
            // Determine the boost weight based on the interaction type
            // saves/completes represent strong signals, views/reads are mild
            let boostWeight = 1;
            switch (action) {
                case 'save':
                case 'list_add':
                    boostWeight = 3;
                    break;
                case 'complete':
                    boostWeight = 2;
                    break;
                case 'read':
                case 'view':
                    boostWeight = 1;
                    break;
            }

            // Apply the boost securely
            await boostTopic(userId, topic || 'general', boostWeight, undefined, tags || []);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error tracking interaction:', error);
        return NextResponse.json({ error: 'Failed to track interaction' }, { status: 500 });
    }
}
