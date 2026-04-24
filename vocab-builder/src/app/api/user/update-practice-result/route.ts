import { NextResponse } from 'next/server';

/**
 * Legacy per-phrase practice mutation removed in Exercise V3.
 * Practice progression is now recorded through feed attempts and completed practice batches.
 */
export async function POST() {
    return NextResponse.json(
        {
            error: 'Legacy per-phrase practice updates have been removed.',
            message: 'Use /api/exercise/submit or /api/practice/complete-session in the Exercise V3 flow.',
            replacements: ['/api/exercise/submit', '/api/practice/complete-session'],
        },
        { status: 410 }
    );
}
