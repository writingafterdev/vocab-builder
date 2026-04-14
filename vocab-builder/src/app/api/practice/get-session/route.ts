import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/appwrite/database';

/**
 * GET /api/practice/get-session?sessionId=xxx
 * Fetches a generated session by ID and deserializes stored JSON fields
 * back into the ExerciseSession shape the frontend expects.
 */
export async function GET(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessionId = request.nextUrl.searchParams.get('sessionId');
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
        }

        const raw = await getDocument('generatedSessions', sessionId) as any;

        if (!raw) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Deserialize JSON string fields back to ExerciseSession shape
        // Appwrite schema mapping:
        //   content   → anchorPassage  (JSON string → AnchorPassage)
        //   questions → questions      (JSON string → SessionQuestion[])
        //   phrases   → vocabWordIds   (JSON string → string[])
        //   title     → topic
        //   subtopic  → centralClaim

        const safeParse = (val: any, fallback: any = []) => {
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) return val;
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch { return fallback; }
            }
            return fallback;
        };

        const anchorPassage = safeParse(raw.content, null);
        const questions = safeParse(raw.questions, []);
        const vocabWordIds = safeParse(raw.phrases || raw.vocabWordIds, []);

        // Handle both new and legacy session formats
        const session = {
            id: raw.id,
            userId: raw.userId,
            anchorPassage: anchorPassage && anchorPassage.text
                ? anchorPassage
                : {
                    // Legacy fallback: construct from old fields
                    text: typeof anchorPassage === 'string' ? anchorPassage : (raw.title || ''),
                    topic: raw.title || 'Untitled Session',
                    centralClaim: raw.subtopic || '',
                    deliberateFlaws: { logicalGap: '', weakTransition: '', registerBreak: '' },
                    embeddedVocab: [],
                    sourcePlatform: undefined,
                },
            questions: Array.isArray(questions) ? questions : [],
            vocabWordIds,
            totalPhrases: raw.totalPhrases || 0,
            status: raw.status || 'generated',
            createdAt: raw.createdAt || '',
            results: safeParse(raw.results, []),
            // Resume support: partial progress
            partialResults: safeParse(raw.partialResults, []),
            currentIndex: raw.currentIndex ?? 0,
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
