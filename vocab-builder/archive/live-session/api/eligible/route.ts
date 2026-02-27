import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';

/**
 * Check if user has enough phrases ready for a Live Session
 * Phrases are eligible when:
 * - learningStep >= 3 (Familiar or higher)
 * - liveSessionStatus is NOT 'passed' (hasn't passed live test yet)
 * 
 * Returns eligible phrases and whether threshold is met (10+ phrases)
 */
export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        console.log('[Live Session Eligible] Checking eligibility for user:', userId);

        if (!userId) {
            console.log('[Live Session Eligible] ERROR: No userId provided');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Query phrases at Step 3+ that haven't passed live session
        // Use GLOBAL savedPhrases collection with userId filter (NOT subcollection)
        // NOTE: Query only by userId to avoid needing composite index, filter step in-memory
        console.log('[Live Session Eligible] Querying phrases at Step 3+...');
        const allUserPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            100 // Fetch more to filter from
        );

        // Filter to Step 3+ in memory
        const eligiblePhrases = allUserPhrases.filter(
            (p: any) => (p.learningStep || 0) >= 3
        );

        console.log(`[Live Session Eligible] Found ${eligiblePhrases.length} phrases at Step 3+`);
        console.log('[Live Session Eligible] Phrases:', eligiblePhrases.map((p: any) => ({
            phrase: p.phrase,
            step: p.learningStep,
            status: p.liveSessionStatus
        })));

        // Filter out phrases that have already passed live session
        const pendingPhrases = eligiblePhrases.filter(
            (p: any) => p.liveSessionStatus !== 'passed'
        );

        console.log(`[Live Session Eligible] ${pendingPhrases.length} pending (not yet passed)`);

        // Check if user has had a live session recently (within last 7 days)
        const lastSessionDate = pendingPhrases
            .map((p: any) => p.lastLiveSessionDate)
            .filter(Boolean)
            .sort()
            .pop();

        const daysSinceLastSession = lastSessionDate
            ? Math.floor((Date.now() - new Date(lastSessionDate).getTime()) / (1000 * 60 * 60 * 24))
            : Infinity;

        console.log('[Live Session Eligible] Last session date:', lastSessionDate);
        console.log('[Live Session Eligible] Days since last session:', daysSinceLastSession);

        const MIN_PHRASES = 10;
        const MIN_DAYS_BETWEEN_SESSIONS = 7;

        const eligible = pendingPhrases.length >= MIN_PHRASES && daysSinceLastSession >= MIN_DAYS_BETWEEN_SESSIONS;

        console.log(`[Live Session Eligible] Result: eligible=${eligible} (need ${MIN_PHRASES} phrases, have ${pendingPhrases.length}; need ${MIN_DAYS_BETWEEN_SESSIONS} days, have ${daysSinceLastSession})`);

        return NextResponse.json({
            eligible,
            phraseCount: pendingPhrases.length,
            phrases: eligible ? pendingPhrases.slice(0, 15) : [], // Return up to 15 phrases for session
            daysSinceLastSession,
            minPhrasesRequired: MIN_PHRASES,
            minDaysBetweenSessions: MIN_DAYS_BETWEEN_SESSIONS
        });

    } catch (error) {
        console.error('Live session eligibility check error:', error);
        return NextResponse.json(
            { error: 'Failed to check eligibility' },
            { status: 500 }
        );
    }
}
