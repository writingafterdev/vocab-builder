import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { runQuery } from '@/lib/firestore-rest';

/**
 * Check if user is eligible for Immersive Mode
 * Eligibility: Has DUE phrases at Step 3+ (past Recognition phase)
 */
export async function GET(request: NextRequest) {
    try {
        // Get user ID from token or header
        const authHeader = request.headers.get('authorization');
        const userIdHeader = request.headers.get('x-user-id');

        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = await verifyIdToken(token);
                if (decoded) {
                    userId = decoded.uid;
                }
            } catch {
                console.log('[Immersive Session Eligible] Token verification failed, using header');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all user's phrases
        const allPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            200
        );

        const now = new Date();

        // Filter to Step 3+ phrases that are DUE
        const eligiblePhrases = allPhrases.filter((p: any) => {
            const step = p.learningStep || 0;
            const nextReview = p.nextReviewDate ? new Date(p.nextReviewDate) : now;
            const isDue = nextReview <= now;
            return step >= 3 && isDue;
        });

        // Need at least 3 DUE phrases at Step 3+ for a meaningful session
        const minPhrases = 3;
        const eligible = eligiblePhrases.length >= minPhrases;

        return NextResponse.json({
            eligible,
            phraseCount: eligiblePhrases.length,
            minRequired: minPhrases,
            message: eligible
                ? 'Immersive Mode available!'
                : `Need ${minPhrases - eligiblePhrases.length} more Step 3+ phrases due for review`
        });
    } catch (error) {
        console.error('[Immersive Session Eligible] Error:', error);
        return NextResponse.json(
            { error: 'Failed to check eligibility' },
            { status: 500 }
        );
    }
}
