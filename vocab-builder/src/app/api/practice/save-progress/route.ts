import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

function safeParseObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {};
        } catch {
            return {};
        }
    }
    return {};
}

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

        const existing = await getDocument('generatedSessions', sessionId) as Record<string, unknown> | null;
        const content = safeParseObject(existing?.content);

        // Save partial results + current position
        await updateDocument('generatedSessions', sessionId, {
            content: JSON.stringify({
                ...content,
                partialResults: results || [],
                currentIndex: currentIndex ?? 0,
            }),
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
