import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/firestore-rest';
import { processArticlePipeline } from '@/lib/import-sources';

const CRON_SECRET = process.env.CRON_SECRET;

// Vercel free plan = 60s timeout. Leave buffer for response.
const MAX_EXECUTION_MS = 50_000;

/**
 * Process pending articles through the AI pipeline.
 * Processes as many articles as possible within the time budget.
 * 
 * Called by Vercel Cron (daily) or manually via admin.
 */
export async function POST(request: NextRequest) {
    try {
        // Auth: Vercel Cron sends CRON_SECRET, admin sends email header
        const authHeader = request.headers.get('Authorization');
        const adminEmail = request.headers.get('x-user-email');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !adminEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const startTime = Date.now();
        const results: { postId: string; title: string; steps: Record<string, string> }[] = [];
        let remaining = 0;

        while (true) {
            // Check time budget
            const elapsed = Date.now() - startTime;
            if (elapsed > MAX_EXECUTION_MS) {
                console.log(`[ProcessNext] Time budget exhausted after ${results.length} articles (${elapsed}ms)`);
                break;
            }

            // Find next pending article
            const pendingPosts = await queryCollection('posts', {
                where: [{ field: 'processingStatus', op: '==', value: 'pending' }],
                limit: 1,
            });

            if (pendingPosts.length === 0) {
                console.log('[ProcessNext] No more pending articles');
                break;
            }

            const post = pendingPosts[0];
            const postId = post.id as string;
            const title = (post.title as string) || 'Untitled';
            const content = (post.content as string) || '';

            console.log(`[ProcessNext] Processing: "${title.slice(0, 60)}..." (${postId})`);

            // Run AI pipeline
            const result = await processArticlePipeline(postId, title, content);

            const successCount = Object.values(result.steps).filter(s => s === 'success').length;
            const failCount = Object.values(result.steps).filter(s => s === 'failed').length;

            results.push({ postId, title, steps: result.steps });
            console.log(`[ProcessNext] Done: ${successCount} ok, ${failCount} failed`);
        }

        // Count remaining
        const remainingPosts = await queryCollection('posts', {
            where: [{ field: 'processingStatus', op: '==', value: 'pending' }],
            limit: 100,
        });
        remaining = remainingPosts.length;

        console.log(`[ProcessNext] Finished. Processed ${results.length}, ${remaining} remaining.`);

        return NextResponse.json({
            success: true,
            processed: results.length,
            remaining,
            articles: results,
        });
    } catch (error) {
        console.error('[ProcessNext] Error:', error);
        return NextResponse.json(
            { error: 'Processing failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// GET for health check
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        description: 'Process pending articles through AI pipeline. POST to trigger.',
    });
}
