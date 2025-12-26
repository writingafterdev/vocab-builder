/**
 * Saved Articles / Bookmarks module
 */
import {
    collection,
    doc,
    addDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    Timestamp,
} from 'firebase/firestore';
import { checkDb } from './core';

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
    const firestore = checkDb();
    const savedRef = collection(firestore, 'savedArticles');

    // Check if already saved
    const existingQuery = query(
        savedRef,
        where('userId', '==', userId),
        where('postId', '==', postId)
    );
    const existing = await getDocs(existingQuery);
    if (!existing.empty) {
        return existing.docs[0].id; // Already saved
    }

    const docRef = await addDoc(savedRef, {
        userId,
        postId,
        savedAt: Timestamp.now(),
    });

    return docRef.id;
}

/**
 * Remove saved article
 */
export async function unsaveArticle(userId: string, postId: string): Promise<void> {
    const firestore = checkDb();
    const savedRef = collection(firestore, 'savedArticles');

    const q = query(
        savedRef,
        where('userId', '==', userId),
        where('postId', '==', postId)
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        await deleteDoc(docSnap.ref);
    }
}

/**
 * Check if article is saved by user
 */
export async function isArticleSaved(userId: string, postId: string): Promise<boolean> {
    const firestore = checkDb();
    const savedRef = collection(firestore, 'savedArticles');

    const q = query(
        savedRef,
        where('userId', '==', userId),
        where('postId', '==', postId)
    );
    const snapshot = await getDocs(q);

    return !snapshot.empty;
}

/**
 * Get all saved articles for a user
 */
export async function getSavedArticles(userId: string): Promise<SavedArticle[]> {
    const firestore = checkDb();
    const savedRef = collection(firestore, 'savedArticles');

    const q = query(
        savedRef,
        where('userId', '==', userId),
        orderBy('savedAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as SavedArticle));
}

/**
 * Get count of saved articles for a user
 */
export async function getSavedArticleCount(userId: string): Promise<number> {
    const firestore = checkDb();
    const savedRef = collection(firestore, 'savedArticles');

    const q = query(savedRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    return snapshot.size;
}
