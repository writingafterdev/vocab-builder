// Vercel free plan = 60s timeout. Leave buffer for response.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runProcessNextLogic } from './logic';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const adminEmail = request.headers.get('x-user-email');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !adminEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Vercel gets 50s. Appwrite Function will pass 850s.
        const data = await runProcessNextLogic(50_000);
        
        return NextResponse.json(data);
    } catch (error) {
        console.error('[ProcessNext] Error:', error);
        return NextResponse.json(
            { error: 'Processing failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'ok',
        description: 'Process pending articles through AI pipeline. POST to trigger.',
    });
}
