import { NextRequest, NextResponse } from 'next/server';
import { fetchSubredditPosts, fetchPostComments } from '@/lib/reddit';
import { setDocument, serverTimestamp } from '@/lib/firestore-rest';
import { RedditComment } from '@/lib/db/types';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

interface ImportRequest {
    subreddit: string;
    sort?: 'hot' | 'top' | 'new' | 'rising';
    time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    limit?: number;
    commentsLimit?: number;
    preview?: boolean; // Just fetch posts, don't import
}

/**
 * Import Reddit posts from a subreddit as articles
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        if (!isAdmin(email)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body: ImportRequest = await request.json();
        const { subreddit, sort = 'top', time = 'week', limit = 10, commentsLimit = 15, preview = false } = body;

        if (!subreddit) {
            return NextResponse.json(
                { error: 'Subreddit is required' },
                { status: 400 }
            );
        }

        console.log(`${preview ? 'Fetching' : 'Importing'} from r/${subreddit}...`);

        // 1. Fetch posts from Reddit
        const posts = await fetchSubredditPosts(subreddit, { sort, time, limit });

        if (posts.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No posts found',
                imported: 0,
                posts: [],
            });
        }

        // Preview mode: just return posts for selection
        if (preview) {
            return NextResponse.json({
                success: true,
                subreddit,
                posts: posts.map(p => ({
                    id: p.id,
                    title: p.title,
                    content: p.content,
                    author: p.author,
                    upvotes: p.upvotes || 0,
                    permalink: p.permalink,
                })),
            });
        }

        const importedPosts = [];

        for (const post of posts) {
            try {
                // 2. Fetch comments for this post
                const comments = await fetchPostComments(subreddit, post.id, {
                    limit: commentsLimit,
                    depth: 3,
                });

                // 3. Convert to RedditComment format for storage
                const redditComments: RedditComment[] = comments.map(c => convertComment(c));

                // 4. Generate unique ID
                const postId = `reddit_${subreddit}_${post.id}`;

                // 5. Store as Post document (simplified - no AI processing during import)
                // Phrase extraction and Lexile evaluation can be done on-demand from article page
                const postDoc = {
                    id: postId,
                    authorId: 'reddit',
                    authorName: post.author,
                    authorUsername: `u/${post.author}`,
                    source: `r/${subreddit}`,
                    content: post.content,
                    title: post.title,
                    isArticle: true,
                    type: 'admin',
                    commentCount: 0,
                    repostCount: 0,
                    highlightedPhrases: [], // Empty - can be extracted on-demand
                    originalUrl: post.permalink,
                    createdAt: serverTimestamp(),

                    // Reddit-specific
                    contentSource: 'reddit',
                    subreddit: subreddit,
                    redditUrl: post.permalink,
                    redditComments: redditComments,
                };

                await setDocument('posts', postId, postDoc as unknown as Record<string, unknown>);
                importedPosts.push({ id: postId, title: post.title });

                console.log(`Imported: ${post.title.slice(0, 50)}...`);

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                console.error(`Error importing post ${post.id}:`, error);
            }
        }

        return NextResponse.json({
            success: true,
            subreddit,
            imported: importedPosts.length,
            posts: importedPosts,
        });

    } catch (error) {
        console.error('Import Reddit error:', error);
        return NextResponse.json(
            { error: 'Failed to import from Reddit' },
            { status: 500 }
        );
    }
}

/**
 * Convert Reddit comment to our format
 */
function convertComment(comment: any): RedditComment {
    return {
        id: comment.id,
        author: comment.author,
        body: comment.body,
        upvotes: comment.upvotes,
        createdAt: comment.createdAt,
        children: comment.children.map((c: any) => convertComment(c)),
    };
}
