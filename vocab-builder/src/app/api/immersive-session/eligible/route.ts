import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { queryCollection } from '@/lib/appwrite/database';

const IMMERSIVE_PHRASE_THRESHOLD = 10;

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const phrases = await queryCollection('savedPhrases', {
            where: [{ field: 'userId', op: '==', value: userId }],
            limit: IMMERSIVE_PHRASE_THRESHOLD,
        });
        const currentPhrases = phrases.length;
        const eligible = currentPhrases >= IMMERSIVE_PHRASE_THRESHOLD;

        return NextResponse.json({
            eligible,
            reason: eligible
                ? 'Immersive Mode unlocked.'
                : `Save at least ${IMMERSIVE_PHRASE_THRESHOLD} phrases to unlock Immersive Mode.`,
            requiredPhrases: IMMERSIVE_PHRASE_THRESHOLD,
            currentPhrases,
        });
    } catch (error) {
        console.error('Immersive session eligibility error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
