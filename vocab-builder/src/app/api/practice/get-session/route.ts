import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

function safeParse<T>(value: unknown, fallback: T): T {
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        return value as T;
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }
    return fallback;
}

/**
 * GET /api/practice/get-session?sessionId=xxx
 * Fetches a generated Exercise V3 practice batch and deserializes stored JSON fields
 * back into the question-centric shape the frontend expects.
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request);
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessionId = request.nextUrl.searchParams.get('sessionId');
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const raw = await getDocument('generatedSessions', sessionId) as Record<string, unknown> | null;

        if (!raw) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const parsedContent = safeParse<Record<string, unknown> | null>(raw.content, null);
        const questions = safeParse<unknown[]>(raw.questions, []);
        const vocabWordIds = safeParse<string[]>(raw.phrases || raw.vocabWordIds, []);

        const isV3Batch = parsedContent?.mode === 'practice_batch_v3';
        if (!isV3Batch) {
            return NextResponse.json(
                {
                    error: 'Legacy passage-based sessions are no longer supported.',
                    message: 'This session predates Exercise V3 and can no longer be opened.',
                },
                { status: 410 }
            );
        }

        const session = {
            id: raw.id,
            userId: raw.userId,
            questions: Array.isArray(questions) ? questions : [],
            vocabWordIds,
            totalPhrases: typeof raw.totalPhrases === 'number' ? raw.totalPhrases : 0,
            status: typeof raw.status === 'string' ? raw.status : 'generated',
            createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
            results: safeParse<unknown[]>(raw.results, []),
            batchMeta: parsedContent,
            // Resume support: partial progress
            partialResults: safeParse<unknown[]>(raw.partialResults, []),
            currentIndex: typeof raw.currentIndex === 'number' ? raw.currentIndex : 0,
        };

        return NextResponse.json({ session });

    } catch (error) {
        console.error('Get session error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch session' },
            { status: 500 }
        );
    }
}
