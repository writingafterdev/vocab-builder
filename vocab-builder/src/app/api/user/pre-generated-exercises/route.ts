import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getDocument } from '@/lib/firestore-rest';

/**
 * GET /api/user/pre-generated-exercises
 * Returns today's pre-generated exercises for the authenticated user.
 * Frontend checks this before falling back to real-time generation.
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const userIdHeader = request.headers.get('x-user-id');
        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = await verifyIdToken(token);
                if (decoded) userId = decoded.uid;
            } catch {
                // fall through to header
            }
        }

        if (!userId && userIdHeader) userId = userIdHeader;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const today = new Date().toISOString().split('T')[0];
        const docId = `${today}_${userId}`;

        const doc = await getDocument('preGeneratedExercises', docId);

        if (!doc || (doc as any).used) {
            return NextResponse.json({ available: false });
        }

        return NextResponse.json({
            available: true,
            data: doc,
        });
    } catch (error) {
        console.error('[Pre-Generated] Error:', error);
        return NextResponse.json({ available: false });
    }
}
