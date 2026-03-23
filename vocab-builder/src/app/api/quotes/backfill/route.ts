import { NextRequest, NextResponse } from 'next/server';
import { extractAndSaveQuotes } from '@/lib/quote-extraction';
import { queryCollection, getDocument } from '@/lib/appwrite/database';

/**
 * POST /api/quotes/backfill
 * 
 * One-time backfill: extract quotes from all existing posts
 * and populate the standalone `quotes` collection.
 * Admin-only endpoint.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;
        if (!isAdmin(email)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const limit = (body as any).limit || 50; // Process N posts per call
        const skipExisting = (body as any).skipExisting !== false; // Default: skip posts that already have extractedQuotes

        // Fetch all posts
        const posts = await queryCollection('posts');

        let processed = 0;
        let skipped = 0;
        let failed = 0;
        const results: Array<{ postId: string; status: string; quoteCount?: number }> = [];

        for (const post of posts) {
            if (processed >= limit) break;

            // Skip posts that already have quotes if requested
            if (skipExisting && post.extractedQuotes && (post.extractedQuotes as string[]).length > 0) {
                skipped++;
                continue;
            }

            // Skip posts without meaningful content
            const content = post.content as string;
            if (!content || content.length < 200) {
                skipped++;
                continue;
            }

            try {
                const title = (post.title as string) || 'Untitled';
                const topic = (post.importTopic as string) || (post.detectedTopic as string)?.toLowerCase() || 'general';
                const author = (post.authorName as string) || 'Unknown';
                const source = (post.source as string) || 'Article';

                const quotes = await extractAndSaveQuotes(
                    post.id, content, title, topic, author, source
                );

                results.push({
                    postId: post.id,
                    status: quotes.length > 0 ? 'success' : 'no_quotes',
                    quoteCount: quotes.length,
                });
                processed++;
            } catch (err) {
                failed++;
                results.push({ postId: post.id, status: 'error' });
                console.error(`[Backfill] Failed for ${post.id}:`, err);
            }

            // Rate limit to avoid API throttling
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return NextResponse.json({
            success: true,
            processed,
            skipped,
            failed,
            totalPosts: posts.length,
            results,
        });
    } catch (error) {
        console.error('Backfill error:', error);
        return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
    }
}
