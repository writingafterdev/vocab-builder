import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/appwrite/database';

/**
 * GET /api/practice/get-session?sessionId=xxx
 * Fetches a generated session by ID and deserializes stored JSON fields
 * back into the shape the frontend expects.
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

        // Deserialize JSON string fields back to the GeneratedSession shape
        // Storage mapping (Appwrite schema → frontend interface):
        //   content   → sections     (JSON string → GeneratedSection[])
        //   subtopic  → subtitle     (string)
        //   phrases   → phraseIds    (JSON string → string[])
        //   topic     → quotes       (JSON string → Quote[])
        //   questions → questions    (JSON string → ComprehensionQuestion[])

        const safeParse = (val: any, fallback: any = []) => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch { return fallback; }
            }
            return fallback;
        };

        const session = {
            id: raw.id,
            userId: raw.userId,
            title: raw.title || 'Untitled Session',
            subtitle: raw.subtopic || raw.subtitle || '',
            sections: safeParse(raw.content || raw.sections),
            questions: safeParse(raw.questions),
            quotes: safeParse(raw.topic && raw.topic.startsWith?.('[') ? raw.topic : raw.quotes),
            phraseIds: safeParse(raw.phrases || raw.phraseIds),
            totalPhrases: raw.totalPhrases || 0,
            status: raw.status || 'generated',
            createdAt: raw.createdAt || '',
            isListeningDay: raw.isListeningDay || false,
            reviewDayIndex: raw.reviewDayIndex || 0,
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
