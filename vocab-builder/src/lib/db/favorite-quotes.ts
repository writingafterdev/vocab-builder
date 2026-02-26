/**
 * Favorite Quotes domain module (Server/Edge Compatible via REST API)
 */
import {
    getDocument,
    setDocument,
    deleteDocument,
    queryCollection,
    serverTimestamp,
} from '../firestore-rest';

export interface FavoriteQuote {
    id: string; // userId_quoteId
    userId: string;
    quoteId: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    createdAt: string | Date; // REST API returns strings for timestamps
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
    const docId = `${userId}_${quote.id}`;
    const collectionPath = 'favorite_quotes';

    // Try to get it first
    const existingDoc = await getDocument(collectionPath, docId);

    if (existingDoc) {
        // It exists, so unsave it
        await deleteDocument(collectionPath, docId);
        return false; // Result is unsaved
    } else {
        // It doesn't exist, so save it
        await setDocument(collectionPath, docId, {
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
    const quotesRef = 'favorite_quotes';
    const qs = await queryCollection(quotesRef, {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }]
    });

    // Sort manually as REST API simple query sometimes doesn't sort complex fields easily out of the box
    const sorted = qs.sort((a, b) => {
        const t1 = new Date(a.createdAt as string).getTime();
        const t2 = new Date(b.createdAt as string).getTime();
        return t2 - t1;
    });

    return sorted as unknown as FavoriteQuote[];
}

export async function getUserSavedQuoteIds(userId: string): Promise<string[]> {
    const quotesRef = 'favorite_quotes';
    const qs = await queryCollection(quotesRef, {
        where: [{ field: 'userId', op: '==', value: userId }]
    });
    return qs.map(doc => doc.quoteId as string);
}
