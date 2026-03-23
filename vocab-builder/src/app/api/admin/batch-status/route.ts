import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, getDocument } from '@/lib/appwrite/database';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/admin/batch-status
 * Returns batch job history + today's pre-generated exercise stats.
 */
export async function GET(request: NextRequest) {
    const adminEmail = request.headers.get('x-user-email');
    if (!adminEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Get recent batch jobs (last 10)
        const jobs = await queryCollection('batchJobs', {
            limit: 10,
        });

        // Sort by submittedAt descending (client-side since Firestore REST limits)
        const sortedJobs = jobs.sort((a, b) => {
            const aTime = a.submittedAt ? new Date(a.submittedAt as string).getTime() : 0;
            const bTime = b.submittedAt ? new Date(b.submittedAt as string).getTime() : 0;
            return bTime - aTime;
        });

        // 2. Get today's pre-generated exercises
        const today = new Date().toISOString().split('T')[0];
        const preGenDocs = await queryCollection('preGeneratedExercises', {
            limit: 50,
        });

        // Filter for today
        const todaysExercises = preGenDocs.filter(d =>
            (d.date as string) === today
        );

        const exerciseStats = todaysExercises.map(doc => ({
            userId: doc.userId as string,
            date: doc.date as string,
            questionCount: Array.isArray(doc.questions) ? doc.questions.length : 0,
            drillCount: Array.isArray(doc.drills) ? doc.drills.length : 0,
            hasImmersive: !!doc.immersiveSession,
            hasBundle: !!doc.bundle,
            generatedAt: doc.generatedAt as string,
            used: !!doc.used,
        }));

        return NextResponse.json({
            jobs: sortedJobs.map(j => ({
                id: j.id,
                batchId: j.batchId,
                name: j.name,
                type: j.type,
                status: j.status,
                requestCount: j.requestCount || 0,
                successCount: j.successCount || 0,
                failCount: j.failCount || 0,
                submittedAt: j.submittedAt,
                completedAt: j.completedAt,
                error: j.error,
            })),
            todaysExercises: exerciseStats,
            summary: {
                totalJobs: sortedJobs.length,
                completedJobs: sortedJobs.filter(j => j.status === 'completed').length,
                failedJobs: sortedJobs.filter(j => j.status === 'failed').length,
                pendingJobs: sortedJobs.filter(j => j.status === 'submitted' || j.status === 'processing').length,
                usersWithExercises: todaysExercises.length,
                totalQuestions: exerciseStats.reduce((s, e) => s + e.questionCount, 0),
                totalDrills: exerciseStats.reduce((s, e) => s + e.drillCount, 0),
            },
        });
    } catch (error) {
        console.error('[BatchStatus] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch batch status' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/batch-status
 * Trigger actions: run daily-import or collect-batch manually.
 */
export async function POST(request: NextRequest) {
    const adminEmail = request.headers.get('x-user-email');
    if (!adminEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'trigger-import') {
        const res = await fetch(new URL('/api/cron/daily-import', request.url), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'x-user-email': adminEmail,
            },
        });
        const data = await res.json();
        return NextResponse.json({ action: 'trigger-import', result: data });
    }

    if (action === 'trigger-collect') {
        const res = await fetch(new URL('/api/cron/collect-batch', request.url), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'x-user-email': adminEmail,
            },
        });
        const data = await res.json();
        return NextResponse.json({ action: 'trigger-collect', result: data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
