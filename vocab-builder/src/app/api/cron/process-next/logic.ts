import { queryCollection } from '@/lib/appwrite/database';
import { processArticlePipeline } from '@/lib/import-sources';

export async function runProcessNextLogic(maxExecutionMs: number = 50_000) {
    const startTime = Date.now();
    const results: { postId: string; title: string; steps: Record<string, string> }[] = [];
    let remaining = 0;

    let communityTargetPhrases: string[] = [];
    try {
        const allSaved = await queryCollection('savedPhrases', { limit: 1000 });
        const counts: Record<string, number> = {};
        for (const doc of allSaved) {
            const phrase = (doc.phrase as string)?.toLowerCase().trim();
            if (phrase && doc.isActive !== false) {
                counts[phrase] = (counts[phrase] || 0) + 1;
            }
        }
        communityTargetPhrases = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(e => e[0]);
        console.log(`[ProcessNext] Loaded ${communityTargetPhrases.length} community target phrases.`);
    } catch (e) {
        console.error('[ProcessNext] Failed to fetch community targets', e);
    }

    while (true) {
        // Check time budget
        const elapsed = Date.now() - startTime;
        if (elapsed > maxExecutionMs) {
            console.log(`[ProcessNext] Time budget exhausted after ${results.length} articles (${elapsed}ms)`);
            break;
        }

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

        const result = await processArticlePipeline(postId, title, content, communityTargetPhrases);

        const successCount = Object.values(result.steps).filter(s => s === 'success').length;
        const failCount = Object.values(result.steps).filter(s => s === 'failed').length;

        results.push({ postId, title, steps: result.steps });
        console.log(`[ProcessNext] Done: ${successCount} ok, ${failCount} failed`);
    }

    const remainingPosts = await queryCollection('posts', {
        where: [{ field: 'processingStatus', op: '==', value: 'pending' }],
        limit: 100,
    });
    remaining = remainingPosts.length;

    console.log(`[ProcessNext] Finished. Processed ${results.length}, ${remaining} remaining.`);

    return {
        success: true,
        processed: results.length,
        remaining,
        articles: results,
    };
}
