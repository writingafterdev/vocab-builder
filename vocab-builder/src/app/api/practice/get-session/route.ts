import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/appwrite/database';

/**
 * GET /api/practice/get-session?sessionId=xxx
 * Fetches a generated session by ID
 */
export async function GET(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessionId = request.nextUrl.searchParams.get('sessionId');
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const session = await getDocument('generatedSessions', sessionId);

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Extension C: Public Verification
        // Sessions are now public to the community, so we do not enforce ownership reading
        // We will handle ownership logic differently when they complete the quiz.

        return NextResponse.json({ session });

    } catch (error) {
        console.error('Get session error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch session' },
            { status: 500 }
        );
    }
}
