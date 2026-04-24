/**
 * Saved Articles / Bookmarks module
 */
import {
    addDocument,
    deleteDocument,
    queryCollection,
    serverTimestamp,
} from '@/lib/appwrite/client-db';
import { Timestamp } from '@/lib/appwrite/timestamp';

export interface SavedArticle {
    id: string;
    userId: string;
    postId: string;
    savedAt: Timestamp;
}

/**
 * Save article for later reading
 */
export async function saveArticle(userId: string, postId: string): Promise<string> {
    const existing = await queryCollection<SavedArticle>('savedArticles', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'postId', op: '==', value: postId },
        ],
        limit: 1,
    });

    if (existing.length > 0) {
        return existing[0].id;
    }

    const savedArticle = await addDocument<SavedArticle>('savedArticles', {
        userId,
        postId,
        savedAt: serverTimestamp(),
    });

    return savedArticle.id;
}

/**
 * Remove saved article
 */
export async function unsaveArticle(userId: string, postId: string): Promise<void> {
    const savedArticles = await queryCollection<SavedArticle>('savedArticles', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'postId', op: '==', value: postId },
        ],
    });

    for (const article of savedArticles) {
        await deleteDocument('savedArticles', article.id);
    }
}

/**
 * Check if article is saved by user
 */
export async function isArticleSaved(userId: string, postId: string): Promise<boolean> {
    const savedArticles = await queryCollection<SavedArticle>('savedArticles', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'postId', op: '==', value: postId },
        ],
        limit: 1,
    });

    return savedArticles.length > 0;
}

/**
 * Get all saved articles for a user
 */
export async function getSavedArticles(userId: string): Promise<SavedArticle[]> {
    return queryCollection<SavedArticle>('savedArticles', {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: [{ field: 'savedAt', direction: 'desc' }],
    });
}

/**
 * Get count of saved articles for a user
 */
export async function getSavedArticleCount(userId: string): Promise<number> {
    const savedArticles = await queryCollection<SavedArticle>('savedArticles', {
        where: [{ field: 'userId', op: '==', value: userId }],
    });

    return savedArticles.length;
}
