/**
 * Posts domain module
 */
import {
    addDocument,
    getDocument,
    queryCollection,
    serverTimestamp,
} from '@/lib/appwrite/client-db';
import { Timestamp } from '@/lib/appwrite/timestamp';
import type { Post, ExtractedPhrase, SentencePair } from './types';

type PaginatedPostsResult = { posts: Post[]; lastDoc: Post | null };
type DateLike = Timestamp | Date | { toMillis?: () => number; getTime?: () => number } | number | null | undefined;
const APPWRITE_DOC_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_]{0,35}$/;

function normalizeLegacyPostId(postId: string): string {
    let normalized = postId.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (normalized.length > 36) {
        normalized = normalized.slice(-36);
    }
    if (/^[^a-zA-Z0-9]/.test(normalized)) {
        normalized = `i${normalized.slice(1)}`;
    }
    return normalized;
}

function getPostIdCandidates(postId: string): string[] {
    const trimmed = postId.trim();
    if (!trimmed) {
        return [];
    }

    const candidates = new Set<string>();
    if (APPWRITE_DOC_ID_RE.test(trimmed)) {
        candidates.add(trimmed);
    }

    const normalized = normalizeLegacyPostId(trimmed);
    if (normalized) {
        candidates.add(normalized);
    }

    return [...candidates];
}

/**
 * Get posts for a user's feed
 * Shows all public posts + AI-generated posts for the specific user
 */
export async function getPosts(limitCount = 20, userId?: string): Promise<Post[]> {
    let posts = await queryCollection<Post>('posts', {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: limitCount * 2,
    });

    // Filter out AI posts that belong to other users
    if (userId) {
        posts = posts.filter(post => {
            // Show all non-AI posts (admin, user)
            if (!post.generatedForUserId) return true;
            // Show AI posts only if they belong to current user
            return post.generatedForUserId === userId;
        });
    } else {
        // No user logged in - only show public posts
        posts = posts.filter(post => !post.generatedForUserId);
    }

    return posts.slice(0, limitCount);
}

/**
 * Get posts for a user's feed with pagination
 * Returns { posts, lastDoc } to use in the next query
 */
export async function getPostsPaginated(
    limitCount = 20, 
    userId?: string, 
    startAfterDoc?: { id?: string } | null,
    topicScores?: Record<string, number>
): Promise<PaginatedPostsResult> {
    let posts = await queryCollection<Post>('posts', {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: limitCount * 2,
        cursorAfter: startAfterDoc?.id,
    });

    const lastDoc = posts.length > 0 ? posts[posts.length - 1] : null;

    // Filter out AI posts that belong to other users
    if (userId) {
        posts = posts.filter(post => {
            // Show all non-AI posts (admin, user)
            if (!post.generatedForUserId) return true;
            // Show AI posts only if they belong to current user
            return post.generatedForUserId === userId;
        });
    } else {
        // No user logged in - only show public posts
        posts = posts.filter(post => !post.generatedForUserId);
    }

    // Smart Sorting: locally sort by topic scores if provided
    if (topicScores && Object.keys(topicScores).length > 0) {
        const getTimeValue = (value: DateLike): number => {
            if (!value) return 0;
            if (value instanceof Timestamp) return value.toMillis();
            if (value instanceof Date) return value.getTime();
            if (typeof value === 'number') return value;
            if (typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value.getTime === 'function') return value.getTime();
            return 0;
        };

        posts.sort((a, b) => {
            const aTopicValue = (a as Post & { importTopic?: string }).importTopic;
            const bTopicValue = (b as Post & { importTopic?: string }).importTopic;
            const aTopic = typeof aTopicValue === 'string' ? aTopicValue : 'general';
            const bTopic = typeof bTopicValue === 'string' ? bTopicValue : 'general';
            const aScore = topicScores[aTopic] || 0;
            const bScore = topicScores[bTopic] || 0;
            
            // Primary sort by score DESC
            if (bScore !== aScore) {
                return bScore - aScore;
            }
            
            // Secondary sort by date DESC (which they originally were, but sort might not be stable)
            const aTime = getTimeValue(a.createdAt);
            const bTime = getTimeValue(b.createdAt);
            return bTime - aTime;
        });
    }

    return { posts: posts.slice(0, limitCount), lastDoc };
}

/**
 * Get all posts (admin/debug only)
 */
export async function getAllPosts(limitCount = 20): Promise<Post[]> {
    return queryCollection<Post>('posts', {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: limitCount,
    });
}

export async function getPost(postId: string): Promise<Post | null> {
    for (const candidate of getPostIdCandidates(postId)) {
        const post = await getDocument<Post>('posts', candidate);
        if (post) {
            return post;
        }
    }

    return null;
}

export async function createPost(data: Omit<Post, 'id' | 'createdAt' | 'commentCount' | 'repostCount'>): Promise<string> {
    const post = await addDocument<Post>('posts', {
        ...data,
        commentCount: 0,
        repostCount: 0,
        createdAt: serverTimestamp(),
    });
    return post.id;
}

// Article-specific interface
export interface ArticleInput {
    title: string;
    content: string;
    coverImage?: string;
    highlightedPhrases?: string[];
    phraseData?: ExtractedPhrase[];
    sentences?: SentencePair[];
    authorName?: string;
    authorUsername?: string;
    source?: string;
    caption?: string;
    originalUrl?: string;
}

export async function createArticle(article: ArticleInput): Promise<string> {
    const postData: Parameters<typeof createPost>[0] = {
        authorId: 'system',
        authorName: article.authorName || 'English Academy',
        authorUsername: article.authorUsername || 'englishacademy',
        source: article.source || article.authorUsername || 'admin',
        content: article.content,
        highlightedPhrases: article.highlightedPhrases || [],
        type: 'admin',
        isArticle: true,
        title: article.title,
        coverImage: article.coverImage,
        originalUrl: article.originalUrl,
    };

    // Add phrase data if available
    if (article.phraseData && article.phraseData.length > 0) {
        postData.phraseData = article.phraseData;
    }
    // Add sentence translations if available
    if (article.sentences && article.sentences.length > 0) {
        postData.sentences = article.sentences;
    }
    if (article.caption) {
        postData.caption = article.caption;
    }

    return createPost(postData);
}

export async function importArticles(articles: ArticleInput[]): Promise<string[]> {
    const ids: string[] = [];
    for (const article of articles) {
        const id = await createArticle(article);
        ids.push(id);
    }
    return ids;
}

// User-imported article (no AI processing)
export interface UserArticleInput {
    title: string;
    content: string;
    userId: string;
    userName?: string;
    source?: string;
    coverImage?: string;
    originalUrl?: string;
}

export async function createUserArticle(article: UserArticleInput): Promise<string> {
    const postData: Parameters<typeof createPost>[0] = {
        authorId: article.userId,
        authorName: article.userName || 'User',
        authorUsername: 'user',
        source: article.source || 'User Import',
        content: article.content,
        highlightedPhrases: [],
        type: 'user', // User-imported, not admin
        isArticle: true,
        title: article.title,
        coverImage: article.coverImage,
        originalUrl: article.originalUrl,
        generatedForUserId: article.userId, // Only visible to this user
    };

    return createPost(postData);
}
