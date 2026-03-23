/**
 * Posts domain module
 */
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    serverTimestamp,
} from '@/lib/firebase/firestore';
import { getDbAsync } from './core';
import type { Post, ExtractedPhrase, SentencePair } from './types';

/**
 * Get posts for a user's feed
 * Shows all public posts + AI-generated posts for the specific user
 */
export async function getPosts(limitCount = 20, userId?: string): Promise<Post[]> {
    const firestore = await getDbAsync();
    const postsRef = collection(firestore, 'posts');

    // Simple query - get all posts ordered by date
    // Client-side filter for personalized content is safer than complex Firestore or() queries
    const q = query(
        postsRef,
        orderBy('createdAt', 'desc'),
        limit(limitCount * 2) // Get extra to filter
    );

    const snapshot = await getDocs(q);
    let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));

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
    startAfterDoc?: any,
    topicScores?: Record<string, number>
): Promise<{ posts: Post[], lastDoc: any }> {
    const firestore = await getDbAsync();
    const postsRef = collection(firestore, 'posts');

    let q = query(
        postsRef,
        orderBy('createdAt', 'desc'),
        limit(limitCount * 2) // Get extra to filter
    );

    if (startAfterDoc) {
        q = query(
            postsRef,
            orderBy('createdAt', 'desc'),
            startAfter(startAfterDoc),
            limit(limitCount * 2) // Get extra to filter
        );
    }

    const snapshot = await getDocs(q);
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));

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
        posts.sort((a, b) => {
            const aTopic = (a as any).importTopic || 'general';
            const bTopic = (b as any).importTopic || 'general';
            const aScore = topicScores[aTopic] || 0;
            const bScore = topicScores[bTopic] || 0;
            
            // Primary sort by score DESC
            if (bScore !== aScore) {
                return bScore - aScore;
            }
            
            // Secondary sort by date DESC (which they originally were, but sort might not be stable)
            // @ts-ignore
            const aTime = a.createdAt?.seconds || 0;
            // @ts-ignore
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });
    }

    return { posts: posts.slice(0, limitCount), lastDoc };
}

/**
 * Get all posts (admin/debug only)
 */
export async function getAllPosts(limitCount = 20): Promise<Post[]> {
    const firestore = await getDbAsync();
    const postsRef = collection(firestore, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
}

export async function getPost(postId: string): Promise<Post | null> {
    const firestore = await getDbAsync();
    const postRef = doc(firestore, 'posts', postId);
    const snapshot = await getDoc(postRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Post;
}

export async function createPost(data: Omit<Post, 'id' | 'createdAt' | 'commentCount' | 'repostCount'>): Promise<string> {
    const firestore = await getDbAsync();
    const postsRef = collection(firestore, 'posts');
    const docRef = await addDoc(postsRef, {
        ...data,
        commentCount: 0,
        repostCount: 0,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
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
