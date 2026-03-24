/**
 * Reddit API wrapper
 * Uses Reddit's public JSON endpoints (no OAuth required)
 */

const USER_AGENT = 'web:vocab-builder:v1.0.0 (by /u/writingafterx)';

// ============================================================================
// TYPES
// ============================================================================

interface RedditPostData {
    id: string;
    title: string;
    selftext: string;
    author: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    permalink: string;
    url: string;
}

interface RedditCommentData {
    id: string;
    author: string;
    body: string;
    body_html?: string;
    score: number;
    created_utc: number;
    replies?: {
        kind: string;
        data: {
            children: Array<{ kind: string; data: RedditCommentData }>;
        };
    };
}

export interface RedditPost {
    id: string;
    title: string;
    content: string;
    author: string;
    subreddit: string;
    upvotes: number;
    commentCount: number;
    createdAt: Date;
    permalink: string;
    url: string;
}

export interface RedditComment {
    id: string;
    author: string;
    body: string;
    upvotes: number;
    createdAt: Date;
    children: RedditComment[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch top posts from a subreddit
 */
export async function fetchSubredditPosts(
    subreddit: string,
    options: {
        sort?: 'hot' | 'top' | 'new' | 'rising';
        time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
        limit?: number;
    } = {}
): Promise<RedditPost[]> {
    const { sort = 'hot', time = 'week', limit = 25 } = options;

    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?t=${time}&limit=${limit}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });

        if (!response.ok) {
            console.error(`Reddit API error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const posts = data.data?.children || [];

        return posts
            .filter((child: any) => child.kind === 't3') // t3 = post
            .map((child: any) => {
                const post: RedditPostData = child.data;
                return {
                    id: post.id,
                    title: post.title,
                    content: post.selftext || '',
                    author: post.author,
                    subreddit: post.subreddit,
                    upvotes: post.score,
                    commentCount: post.num_comments,
                    createdAt: new Date(post.created_utc * 1000),
                    permalink: `https://reddit.com${post.permalink}`,
                    url: post.url,
                };
            })
            .filter((post: RedditPost) => post.content.length > 50); // Only posts with content
    } catch (error) {
        console.error('Error fetching subreddit posts:', error);
        return [];
    }
}

/**
 * Fetch comments for a post
 */
export async function fetchPostComments(
    subreddit: string,
    postId: string,
    options: {
        limit?: number;
        depth?: number;
    } = {}
): Promise<RedditComment[]> {
    const { limit = 20, depth = 3 } = options;

    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=${limit}&depth=${depth}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });

        if (!response.ok) {
            console.error(`Reddit API error: ${response.status}`);
            return [];
        }

        const data = await response.json();

        // Reddit returns [post, comments] array
        const commentsListing = data[1]?.data?.children || [];

        return buildCommentTree(commentsListing);
    } catch (error) {
        console.error('Error fetching post comments:', error);
        return [];
    }
}

/**
 * Build hierarchical comment tree from flat Reddit response
 */
function buildCommentTree(children: Array<{ kind: string; data: RedditCommentData }>): RedditComment[] {
    return children
        .filter((child) => child.kind === 't1') // t1 = comment
        .filter((child) => child.data.author !== '[deleted]')
        .filter((child) => child.data.body && child.data.body !== '[deleted]')
        .map((child) => {
            const comment = child.data;
            const replies = comment.replies?.data?.children || [];

            return {
                id: comment.id,
                author: comment.author,
                body: comment.body,
                upvotes: comment.score,
                createdAt: new Date(comment.created_utc * 1000),
                children: buildCommentTree(replies),
            };
        });
}

/**
 * Flatten comment tree for phrase extraction (includes all nested comments)
 */
export function flattenComments(comments: RedditComment[]): RedditComment[] {
    const result: RedditComment[] = [];

    function traverse(comment: RedditComment) {
        result.push(comment);
        for (const child of comment.children) {
            traverse(child);
        }
    }

    for (const comment of comments) {
        traverse(comment);
    }

    return result;
}
