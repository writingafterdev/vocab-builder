/**
 * Favorite Quotes domain module
 */
import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { getDbAsync } from './core';

export interface FavoriteQuote {
    id: string; // Will use userId_quoteId as document ID for easy toggling
    userId: string;
    quoteId: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    createdAt: Timestamp;
}

export async function toggleFavoriteQuote(
    userId: string,
    quote: {
        id: string;
        text: string;
        postId: string;
        postTitle: string;
        author: string;
    }
): Promise<boolean> {
    const firestore = await getDbAsync();
    const docId = `${userId}_${quote.id}`;
    const quoteRef = doc(firestore, 'favorite_quotes', docId);

    // Try to get it first
    const snapshot = await getDocs(query(collection(firestore, 'favorite_quotes'), where('__name__', '==', docId)));

    if (!snapshot.empty) {
        // It exists, so unsave it
        await deleteDoc(quoteRef);
        return false; // Result is unsaved
    } else {
        // It doesn't exist, so save it
        await setDoc(quoteRef, {
            userId,
            quoteId: quote.id,
            text: quote.text,
            postId: quote.postId,
            postTitle: quote.postTitle,
            author: quote.author,
            createdAt: serverTimestamp(),
        });
        return true; // Result is saved
    }
}

export async function getUserFavoriteQuotes(userId: string): Promise<FavoriteQuote[]> {
    const firestore = await getDbAsync();
    const quotesRef = collection(firestore, 'favorite_quotes');
    const q = query(
        quotesRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FavoriteQuote));
}

export async function getUserSavedQuoteIds(userId: string): Promise<string[]> {
    const firestore = await getDbAsync();
    const quotesRef = collection(firestore, 'favorite_quotes');
    const q = query(quotesRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().quoteId as string);
}
