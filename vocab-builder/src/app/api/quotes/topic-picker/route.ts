import { NextRequest, NextResponse } from 'next/server';
import { saveTopicPickerChoices } from '@/lib/db/quote-feed';

/**
 * POST /api/quotes/topic-picker
 * 
 * Save the user's topic preferences from the onboarding picker
 * Each selected topic gets an initial boost of 5 points
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { topics } = body as { topics?: string[] };

        if (!topics || topics.length < 3) {
            return NextResponse.json(
                { error: 'Please select at least 3 topics' },
                { status: 400 }
            );
        }

        await saveTopicPickerChoices(userId, topics);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving topic preferences:', error);
        return NextResponse.json({ error: 'Failed to save topics' }, { status: 500 });
    }
}
