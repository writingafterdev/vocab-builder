/**
 * Admin functions domain module
 * Migrated to native Appwrite SDK (no Firestore polyfill)
 */
import {
    getDocument,
    setDocument,
    queryCollection,
    deleteDocument,
    addDocument,
} from '@/lib/appwrite/database';
import { Query } from 'node-appwrite';
import type { Post, LearningCycleSettings } from './types';
import { DEFAULT_LEARNING_CYCLE } from './types';
import type { UserProfile } from '@/types';

// ============ SETTINGS ============

export async function getLearningCycleSettings(): Promise<LearningCycleSettings> {
    try {
        const doc = await getDocument('settings', 'learningCycle');
        if (!doc) return DEFAULT_LEARNING_CYCLE;
        return doc as unknown as LearningCycleSettings;
    } catch (error) {
        console.warn('Failed to load learning cycle settings:', error);
        return DEFAULT_LEARNING_CYCLE;
    }
}

export async function updateLearningCycleSettings(settings: LearningCycleSettings): Promise<void> {
    await setDocument('settings', 'learningCycle', settings as unknown as Record<string, unknown>);
}

// ============ ADMIN CRUD ============

export async function getAllUsers(): Promise<UserProfile[]> {
    const docs = await queryCollection('users', [
        Query.orderDesc('createdAt'),
        Query.limit(500),
    ]);
    return docs.map(d => ({
        ...d,
        uid: (d.uid as string) || d.id,
    } as unknown as UserProfile));
}

export async function deletePost(postId: string): Promise<void> {
    await deleteDocument('posts', postId);

    // Delete associated comments
    const comments = await queryCollection('comments', [
        Query.equal('postId', postId),
    ]);
    for (const comment of comments) {
        await deleteDocument('comments', comment.id);
    }

    // Delete associated reposts
    const reposts = await queryCollection('reposts', [
        Query.equal('postId', postId),
    ]);
    for (const repost of reposts) {
        await deleteDocument('reposts', repost.id);
    }
}

/**
 * Bulk delete all posts from the database
 * Returns the count of deleted posts
 */
export async function bulkDeleteAllPosts(): Promise<{ deleted: number; errors: string[] }> {
    const docs = await queryCollection('posts', [Query.limit(500)]);

    let deleted = 0;
    const errors: string[] = [];

    for (const doc of docs) {
        try {
            await deleteDocument('posts', doc.id);
            deleted++;
        } catch (error) {
            console.error(`Failed to delete post ${doc.id}:`, error);
            errors.push(doc.id);
        }
    }

    return { deleted, errors };
}

/**
 * Bulk delete only articles (isArticle === true) from the database
 * Also cleans up associated comments and reposts
 */
export async function bulkDeleteAllArticles(): Promise<{ deleted: number; errors: string[] }> {
    const docs = await queryCollection('posts', [
        Query.equal('isArticle', true),
        Query.limit(500),
    ]);

    let deleted = 0;
    const errors: string[] = [];

    for (const doc of docs) {
        try {
            // Delete associated comments
            const comments = await queryCollection('comments', [
                Query.equal('postId', doc.id),
            ]);
            for (const comment of comments) {
                await deleteDocument('comments', comment.id);
            }

            // Delete associated reposts
            const reposts = await queryCollection('reposts', [
                Query.equal('postId', doc.id),
            ]);
            for (const repost of reposts) {
                await deleteDocument('reposts', repost.id);
            }

            await deleteDocument('posts', doc.id);
            deleted++;
        } catch (error) {
            console.error(`Failed to delete article ${doc.id}:`, error);
            errors.push(doc.id);
        }
    }

    return { deleted, errors };
}

export async function updatePost(postId: string, data: Partial<Omit<Post, 'id' | 'createdAt'>>): Promise<void> {
    const { setDocument: _, ...updateData } = data as any;
    const { updateDocument } = await import('@/lib/appwrite/database');
    await updateDocument('posts', postId, updateData as Record<string, any>);
}

export async function getAdminStats(): Promise<{
    totalUsers: number;
    totalPosts: number;
    totalArticles: number;
    totalScenarios: number;
    totalPhrases: number;
    totalTokens: number;
}> {
    const [users, posts, scenarios, tokenUsageDocs, savedPhrases] = await Promise.all([
        queryCollection('users', [Query.limit(500)]),
        queryCollection('posts', [Query.limit(500)]),
        queryCollection('scenarios', [Query.limit(500)]),
        queryCollection('tokenUsage', [Query.limit(500)]),
        queryCollection('savedPhrases', [Query.limit(500)]),
    ]);

    // Sum total tokens
    let totalTokens = 0;
    tokenUsageDocs.forEach(doc => {
        totalTokens += (doc.totalTokens as number) || 0;
    });

    const articles = posts.filter(p => p.isArticle === true);
    const regularPosts = posts.filter(p => !p.isArticle);

    return {
        totalUsers: users.length,
        totalPosts: regularPosts.length,
        totalArticles: articles.length,
        totalScenarios: scenarios.length,
        totalPhrases: savedPhrases.length,
        totalTokens,
    };
}

// ============ POSTS WITH COMMENTS ============

interface ImportComment {
    content: string;
    author?: string;
}

interface PostWithCommentsInput {
    content: string;
    title?: string;
    coverImage?: string;
    isArticle?: boolean;
    highlightedPhrases?: string[];
    authorName?: string;
    authorUsername?: string;
    source?: string;
    originalUrl?: string;
    comments?: ImportComment[];
    // Normalized Layer features
    sourceId?: string;
    section?: string;
}

export async function createPostWithComments(input: PostWithCommentsInput): Promise<string> {
    const postId = await addDocument('posts', {
        authorId: 'system',
        authorName: input.authorName || 'English Academy',
        authorUsername: input.authorUsername || 'englishacademy',
        source: input.source || input.authorUsername || 'admin',
        content: input.content,
        highlightedPhrases: JSON.stringify(input.highlightedPhrases || []),
        type: 'admin',
        isArticle: input.isArticle || false,
        title: input.title || '',
        coverImage: input.coverImage || '',
        originalUrl: input.originalUrl || '',
        sourceId: input.sourceId || '',
        section: input.section || '',
        commentCount: input.comments?.length || 0,
        repostCount: 0,
        createdAt: new Date().toISOString(),
    });

    if (input.comments && input.comments.length > 0) {
        for (const comment of input.comments) {
            await addDocument('comments', {
                postId,
                authorId: 'system',
                authorName: comment.author || 'Anonymous',
                authorUsername: comment.author?.toLowerCase().replace(/\s/g, '_') || 'anonymous',
                content: comment.content,
                likeCount: 0,
                replyCount: 0,
                parentId: '',
                createdAt: new Date().toISOString(),
            });
        }
    }

    return postId;
}

// ============ ADMIN USER DETAIL ============

export interface UserScenario {
    id: string;
    scenario: string;
    userRole: string;
    createdAt: Date;
    status: string;
    phrasesTotal: number;
    phrasesUsed: number;
    phrasesNatural: number;
    turnsCount: number;
}

export async function getUserScenarios(userId: string): Promise<UserScenario[]> {
    const docs = await queryCollection('scenarios', [
        Query.equal('userId', userId),
        Query.orderDesc('createdAt'),
        Query.limit(50),
    ]);
    return docs.map(doc => {
        const phrases = doc.phrases ? (typeof doc.phrases === 'string' ? JSON.parse(doc.phrases as string) : doc.phrases) : [];
        return {
            id: doc.id,
            scenario: (doc.scenario as string) || 'Untitled',
            userRole: (doc.userRole as string) || '',
            createdAt: doc.createdAt ? new Date(doc.createdAt as string) : new Date(),
            status: (doc.status as string) || 'unknown',
            phrasesTotal: Array.isArray(phrases) ? phrases.length : 0,
            phrasesUsed: Array.isArray(phrases) ? phrases.filter((p: any) => p.used).length : 0,
            phrasesNatural: Array.isArray(phrases) ? phrases.filter((p: any) => p.status === 'natural').length : 0,
            turnsCount: doc.turns ? (typeof doc.turns === 'string' ? JSON.parse(doc.turns as string) : doc.turns).length : 0,
        };
    });
}

export interface UserPost {
    id: string;
    title?: string;
    content: string;
    isArticle: boolean;
    createdAt: Date;
    commentCount: number;
    repostCount: number;
}

export async function getUserPosts(userId: string): Promise<UserPost[]> {
    const docs = await queryCollection('posts', [
        Query.equal('authorId', userId),
        Query.orderDesc('createdAt'),
        Query.limit(50),
    ]);
    return docs.map(doc => ({
        id: doc.id,
        title: doc.title as string | undefined,
        content: (doc.content as string) || '',
        isArticle: (doc.isArticle as boolean) || false,
        createdAt: doc.createdAt ? new Date(doc.createdAt as string) : new Date(),
        commentCount: (doc.commentCount as number) || 0,
        repostCount: (doc.repostCount as number) || 0,
    }));
}

export interface UserTokenUsage {
    endpoint: string;
    totalTokens: number;
    callCount: number;
    avgTokensPerCall: number;
}

export async function getUserTokenUsage(userEmail: string): Promise<{
    total: number;
    calls: number;
    byEndpoint: UserTokenUsage[];
}> {
    const docs = await queryCollection('tokenUsage', [
        Query.equal('userEmail', userEmail),
        Query.limit(500),
    ]);

    const byEndpoint: Record<string, { tokens: number; calls: number }> = {};
    let total = 0;
    let calls = 0;

    docs.forEach(doc => {
        const endpoint = (doc.endpoint as string) || 'unknown';
        const tokens = (doc.totalTokens as number) || 0;
        total += tokens;
        calls += 1;
        if (!byEndpoint[endpoint]) {
            byEndpoint[endpoint] = { tokens: 0, calls: 0 };
        }
        byEndpoint[endpoint].tokens += tokens;
        byEndpoint[endpoint].calls += 1;
    });

    return {
        total,
        calls,
        byEndpoint: Object.entries(byEndpoint).map(([endpoint, stats]) => ({
            endpoint,
            totalTokens: stats.tokens,
            callCount: stats.calls,
            avgTokensPerCall: stats.calls > 0 ? Math.round(stats.tokens / stats.calls) : 0,
        })),
    };
}

export async function getUserSavedPhrases(userId: string): Promise<Array<{
    id: string;
    phrase: string;
    meaning: string;
    createdAt: Date;
    usageCount: number;
}>> {
    const docs = await queryCollection('savedPhrases', [
        Query.equal('userId', userId),
        Query.orderDesc('createdAt'),
        Query.limit(100),
    ]);
    return docs.map(doc => ({
        id: doc.id,
        phrase: (doc.phrase as string) || '',
        meaning: (doc.meaning as string) || '',
        createdAt: doc.createdAt ? new Date(doc.createdAt as string) : new Date(),
        usageCount: (doc.usageCount as number) || 0,
    }));
}
