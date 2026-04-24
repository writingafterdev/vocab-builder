import { NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';
import { createArticle } from '@/lib/db/posts';
import { getAdminRequestContext } from '@/lib/admin-auth';

const SUBREDDITS = [
    'todayilearned', 'technology', 'worldnews', 'news', 'politics',
    'explainlikeimfive', 'AskReddit', 'NoStupidQuestions',
    'unpopularopinion', 'Advice'
];

interface RedditCommentChild {
    kind?: string;
    data?: {
        body?: string;
    };
}

export async function POST(req: Request) {
    try {
        const admin = await getAdminRequestContext(req);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const results = [];
        for (const sub of SUBREDDITS) {
            console.log(`[Reddit Sync] Fetching r/${sub}...`);
            const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=3`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocabBuilder/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) continue;

            const data = await res.json();
            const posts = data?.data?.children || [];

            for (const postWrapper of posts) {
                const post = postWrapper.data;
                if (!post || post.stickied || post.is_video || post.is_gallery) continue;

                const url = `https://www.reddit.com${post.permalink}`;
                
                // Deduplication check
                const existingPosts = await queryCollection('posts', {
                    where: [{ field: 'originalUrl', op: '==', value: url }],
                    limit: 1,
                });
                if (existingPosts.length > 0) {
                    console.log(`[Reddit Sync] Skipping duplicate: ${url}`);
                    continue;
                }

                // Fetch Comments
                const commentsRes = await fetch(`${url}.json?limit=10`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocabBuilder/1.0)' },
                });
                
                if (!commentsRes.ok) continue;
                const commentsData = await commentsRes.json();
                const commentsListing: RedditCommentChild[] = commentsData?.[1]?.data?.children || [];

                const topComments = commentsListing
                    .filter((comment) => comment.kind === 't1' && comment.data?.body)
                    .slice(0, 10)
                    .map((comment) => {
                        // Very basic sanitization
                        const cleanBody = comment.data?.body?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '';
                        return `<li class="mb-2 pb-2 border-b border-neutral-100">${cleanBody}</li>`;
                    });

                let contentHtml = `<h2>${post.title}</h2>`;
                if (post.selftext) {
                    const cleanText = post.selftext.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
                    contentHtml += `<p class="my-4 leading-relaxed">${cleanText}</p>`;
                }
                
                if (topComments.length > 0) {
                    contentHtml += `<h3 class="mt-6 mb-3 font-semibold text-lg">Top Discussions</h3><ul class="space-y-2 relative">${topComments.join('')}</ul>`;
                }

                try {
                    // Create Post
                    const postId = await createArticle({
                        title: post.title,
                        content: contentHtml,
                        source: `r/${sub}`,
                        authorName: post.author,
                        originalUrl: url,
                    });
                    
                    results.push({ id: postId, title: post.title, source: `r/${sub}` });
                } catch (dbErr) {
                    console.error(`[Reddit Sync] Appwrite db error for ${url}:`, dbErr);
                }
            }
        }

        return NextResponse.json({ success: true, count: results.length, results });
    } catch (error) {
        console.error('Reddit sync error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
