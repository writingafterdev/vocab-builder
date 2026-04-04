import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';

/**
 * GET /api/practice/list-sessions
 * Returns the user's generated practice sessions (most recent first).
 * Always returns 200 — worst case returns an empty array.
 */
export async function GET(request: NextRequest) {
    try {
        // Auth: accept either Bearer token or x-user-id header
        let userId: string | null = null;

        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const { verifyIdToken } = await import('@/lib/appwrite/auth-admin');
                const verified = await verifyIdToken(authHeader);
                userId = verified?.$id || null;
            } catch {
                // ignore — fall through to x-user-id
            }
        }

        if (!userId) {
            userId = request.headers.get('x-user-id');
        }

        if (!userId) {
            return NextResponse.json({ sessions: [] });
        }

        // Query generatedSessions for this user via Appwrite SDK
        const docs = await queryCollection('generatedSessions', {
            where: [{ field: 'userId', op: '==', value: userId }],
            orderBy: [{ field: 'createdAt', direction: 'desc' }],
            limit: 20,
        });

        const sessions = docs.map((doc: any) => {
            // Parse JSON strings back to arrays for counts
            let sectionCount = 0;
            let questionCount = 0;

            try {
                const sections = typeof doc.content === 'string' ? JSON.parse(doc.content) : (doc.content || []);
                sectionCount = Array.isArray(sections) ? sections.length : 0;
            } catch { /* ignore parse errors */ }

            try {
                const questions = typeof doc.questions === 'string' ? JSON.parse(doc.questions) : (doc.questions || []);
                questionCount = Array.isArray(questions) ? questions.length : 0;
            } catch { /* ignore parse errors */ }

            return {
                id: doc.id,
                title: doc.title || 'Untitled Session',
                subtitle: doc.subtopic || '',
                totalPhrases: doc.totalPhrases || 0,
                status: doc.status || 'generated',
                sectionCount,
                questionCount,
                createdAt: doc.createdAt || '',
            };
        });

        return NextResponse.json({ sessions });

    } catch (error) {
        console.error('[list-sessions] Unexpected error:', error);
        // Always return 200 with empty sessions rather than crashing the UI
        return NextResponse.json({ sessions: [] });
    }
}
