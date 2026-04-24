import { NextRequest, NextResponse } from 'next/server';
import { updateDocument } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

/**
 * POST /api/practice/save-progress
 * Persists per-question results as the user answers them.
 * Called after each answer so progress survives browser refreshes.
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request);
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { sessionId, results, currentIndex } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        // Save partial results + current position
        await updateDocument('generatedSessions', sessionId, {
            partialResults: JSON.stringify(results || []),
            currentIndex: currentIndex ?? 0,
            status: 'in_progress',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Save progress error:', error);
        return NextResponse.json(
            { error: 'Failed to save progress' },
            { status: 500 }
        );
    }
}
