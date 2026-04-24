import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

type SessionDoc = Record<string, unknown>;

/**
 * GET /api/practice/list-sessions
 * Returns the user's generated practice sessions (most recent first).
 * Always returns 200 — worst case returns an empty array.
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId || null;

        if (!userId) {
            return NextResponse.json({ sessions: [] });
        }

        // Query generatedSessions for this user via Appwrite SDK
        const docs = await queryCollection('generatedSessions', {
            where: [{ field: 'userId', op: '==', value: userId }],
            orderBy: [{ field: 'createdAt', direction: 'desc' }],
            limit: 20,
        });

        const sessions = docs.map((doc) => {
            const sessionDoc = doc as SessionDoc;
            // Parse JSON fields
            let questionCount = 0;
            let topic = '';
            let centralClaim = '';
            let isV3Batch = false;

            try {
                const questions = typeof sessionDoc.questions === 'string'
                    ? JSON.parse(sessionDoc.questions)
                    : (sessionDoc.questions || []);
                questionCount = Array.isArray(questions) ? questions.length : 0;
            } catch { /* ignore */ }

            // Extract the display topic from the stored V3 batch metadata.
            try {
                const passage = typeof sessionDoc.content === 'string'
                    ? JSON.parse(sessionDoc.content)
                    : sessionDoc.content;
                isV3Batch = passage?.mode === 'practice_batch_v3';
                if (passage && typeof passage === 'object' && passage.topic) {
                    topic = passage.topic;
                    centralClaim = passage.centralClaim || '';
                } else if (isV3Batch) {
                    topic = typeof sessionDoc.title === 'string' ? sessionDoc.title : 'Practice Batch';
                    centralClaim = passage.summary || (typeof sessionDoc.subtopic === 'string' ? sessionDoc.subtopic : '');
                }
            } catch { /* ignore */ }

            return {
                id: sessionDoc.id,
                topic: topic || (typeof sessionDoc.title === 'string' ? sessionDoc.title : 'Untitled Session'),
                centralClaim: centralClaim || (typeof sessionDoc.subtopic === 'string' ? sessionDoc.subtopic : ''),
                totalPhrases: typeof sessionDoc.totalPhrases === 'number' ? sessionDoc.totalPhrases : 0,
                status: typeof sessionDoc.status === 'string' ? sessionDoc.status : 'generated',
                questionCount,
                createdAt: typeof sessionDoc.createdAt === 'string' ? sessionDoc.createdAt : '',
                isV3Batch,
            };
        }).filter((session) => session.isV3Batch);

        return NextResponse.json({ sessions });

    } catch (error) {
        console.error('[list-sessions] Unexpected error:', error);
        return NextResponse.json({ sessions: [] });
    }
}
