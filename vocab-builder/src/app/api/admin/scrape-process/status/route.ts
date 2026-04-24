import { NextRequest, NextResponse } from 'next/server';
import { getAdminRequestContext } from '@/lib/admin-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.AISTUDIO_API_KEY;

export async function GET(request: NextRequest) {
    try {
        const admin = await getAdminRequestContext(request);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const batchId = request.nextUrl.searchParams.get('batchId');
        if (!batchId) {
            return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
        }

        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const batchJob = await ai.batches.get({ name: batchId });
        
        return NextResponse.json({
            success: true,
            status: batchJob.state ? batchJob.state.replace('JOB_STATE_', '') : 'UNKNOWN',
            requestCount: (batchJob as any).requestCount || 0,
            completedCount: (batchJob as any).completedCount || 0,
            failedCount: (batchJob as any).failedCount || 0
        });

    } catch (error) {
        console.error('Batch status endpoint error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown server error' },
            { status: 500 }
        );
    }
}
