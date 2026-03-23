import { NextRequest, NextResponse } from 'next/server';
import { runGenerateFactsLogic } from './logic';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        if (process.env.NODE_ENV === 'production') {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    try {
        const data = await runGenerateFactsLogic();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[FactGen] Fatal error during fact generation:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
