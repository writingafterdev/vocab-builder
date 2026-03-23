// Vercel Hobby plan: max 60s for serverless functions
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { runCollectBatchLogic } from './logic';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const adminEmail = request.headers.get('x-user-email');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !adminEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await runCollectBatchLogic();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[CollectBatch] Fatal error:', error);
        return NextResponse.json(
            { error: 'Collect failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return POST(request);
}
