import { NextResponse } from 'next/server';

/**
 * Legacy exercise endpoint retained only as an explicit compatibility stub.
 * Session listing now lives under /api/practice/list-sessions in Exercise V3.
 */
export async function GET() {
    return NextResponse.json(
        {
            error: 'Legacy exercise session listing has been removed.',
            message: 'Use /api/practice/list-sessions for the current practice flow.',
            replacement: '/api/practice/list-sessions',
            sessions: {},
        },
        { status: 410 }
    );
}
