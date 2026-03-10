import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';

/**
 * GET /api/practice/list-sessions
 * Returns the user's generated practice sessions (most recent first)
 */
export async function GET(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const docs = await runQuery(
            'generatedSessions',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            20
        );

        // Map to summary objects (don't send full article content)
        const sessions = (docs || []).map((doc: any) => ({
            id: doc.id || doc._docId,
            title: doc.title || 'Untitled Session',
            subtitle: doc.subtitle || '',
            totalPhrases: doc.totalPhrases || 0,
            status: doc.status || 'generated',
            sectionCount: doc.sections?.length || 0,
            questionCount: doc.questions?.length || 0,
            createdAt: doc.createdAt || '',
        }));

        // Sort by createdAt descending (most recent first)
        sessions.sort((a: any, b: any) => {
            const timeA = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0;
            const timeB = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });

        return NextResponse.json({ sessions });

    } catch (error) {
        console.error('List sessions error:', error);
        return NextResponse.json(
            { error: 'Failed to list sessions' },
            { status: 500 }
        );
    }
}
