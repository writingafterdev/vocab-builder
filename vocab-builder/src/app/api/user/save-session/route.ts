import { NextResponse } from 'next/server';

/**
 * Legacy exercise endpoint retained only as an explicit compatibility stub.
 * Practice/session persistence now lives under /api/practice/* in Exercise V3.
 */
export async function POST() {
    return NextResponse.json(
        {
            error: 'Legacy exercise session saving has been removed.',
            message: 'Use /api/practice/complete-session for the current practice flow.',
            replacement: '/api/practice/complete-session',
        },
        { status: 410 }
    );
}
