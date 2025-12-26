/**
 * Admin functions domain module
 */
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
} from 'firebase/firestore';
import { checkDb } from './core';
import type { Post, LearningCycleSettings } from './types';
import { DEFAULT_LEARNING_CYCLE } from './types';
import type { UserProfile } from '@/types';

// ============ SETTINGS ============

export async function getLearningCycleSettings(): Promise<LearningCycleSettings> {
    const firestore = checkDb();
    const settingsRef = doc(firestore, 'settings', 'learningCycle');
    const snapshot = await getDoc(settingsRef);

    if (!snapshot.exists()) {
        await setDoc(settingsRef, DEFAULT_LEARNING_CYCLE);
        return DEFAULT_LEARNING_CYCLE;
    }

    return snapshot.data() as LearningCycleSettings;
}

export async function updateLearningCycleSettings(settings: LearningCycleSettings): Promise<void> {
    const firestore = checkDb();
    const settingsRef = doc(firestore, 'settings', 'learningCycle');
    await setDoc(settingsRef, settings);
}

// ============ ADMIN CRUD ============

export async function getAllUsers(): Promise<UserProfile[]> {
    const firestore = checkDb();
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
}

export async function deletePost(postId: string): Promise<void> {
    const firestore = checkDb();
    const postRef = doc(firestore, 'posts', postId);
    await deleteDoc(postRef);

    // Delete associated comments
    const commentsRef = collection(firestore, 'comments');
    const commentsQuery = query(commentsRef, where('postId', '==', postId));
    const commentsSnapshot = await getDocs(commentsQuery);
    for (const commentDoc of commentsSnapshot.docs) {
        await deleteDoc(commentDoc.ref);
    }

    // Delete associated reposts
    const repostsRef = collection(firestore, 'reposts');
    const repostsQuery = query(repostsRef, where('postId', '==', postId));
    const repostsSnapshot = await getDocs(repostsQuery);
    for (const repostDoc of repostsSnapshot.docs) {
        await deleteDoc(repostDoc.ref);
    }
}

export async function updatePost(postId: string, data: Partial<Omit<Post, 'id' | 'createdAt'>>): Promise<void> {
    const firestore = checkDb();
    const postRef = doc(firestore, 'posts', postId);
    await updateDoc(postRef, data);
}

export async function getAdminStats(): Promise<{
    totalUsers: number;
    totalPosts: number;
    totalArticles: number;
    totalDebates: number;
    totalPhrases: number;
    totalTokens: number;
}> {
    const firestore = checkDb();

    const usersSnapshot = await getDocs(collection(firestore, 'users'));
    const postsSnapshot = await getDocs(collection(firestore, 'posts'));
    const debatesSnapshot = await getDocs(collection(firestore, 'debates'));
    const tokenUsageSnapshot = await getDocs(collection(firestore, 'tokenUsage'));

    // Count phrases across all users
    let totalPhrases = 0;
    for (const userDoc of usersSnapshot.docs) {
        const phrasesSnapshot = await getDocs(collection(firestore, 'users', userDoc.id, 'savedPhrases'));
        totalPhrases += phrasesSnapshot.size;
    }

    // Sum total tokens
    let totalTokens = 0;
    tokenUsageSnapshot.docs.forEach(doc => {
        totalTokens += doc.data().totalTokens || 0;
    });

    const posts = postsSnapshot.docs.map(doc => doc.data());
    const articles = posts.filter(p => p.isArticle === true);
    const regularPosts = posts.filter(p => !p.isArticle);

    return {
        totalUsers: usersSnapshot.size,
        totalPosts: regularPosts.length,
        totalArticles: articles.length,
        totalDebates: debatesSnapshot.size,
        totalPhrases,
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
    originalUrl?: string; // For imported content
    comments?: ImportComment[];
}

export async function createPostWithComments(input: PostWithCommentsInput): Promise<string> {
    const firestore = checkDb();
    const postsRef = collection(firestore, 'posts');

    const postDoc = await addDoc(postsRef, {
        authorId: 'system',
        authorName: input.authorName || 'English Academy',
        authorUsername: input.authorUsername || 'englishacademy',
        source: input.source || input.authorUsername || 'admin',
        content: input.content,
        highlightedPhrases: input.highlightedPhrases || [],
        type: 'admin',
        isArticle: input.isArticle || false,
        title: input.title,
        coverImage: input.coverImage,
        originalUrl: input.originalUrl,
        commentCount: input.comments?.length || 0,
        repostCount: 0,
        createdAt: serverTimestamp(),
    });

    if (input.comments && input.comments.length > 0) {
        const commentsRef = collection(firestore, 'comments');
        for (const comment of input.comments) {
            await addDoc(commentsRef, {
                postId: postDoc.id,
                authorId: 'system',
                authorName: comment.author || 'Anonymous',
                authorUsername: comment.author?.toLowerCase().replace(/\s/g, '_') || 'anonymous',
                content: comment.content,
                likeCount: 0,
                replyCount: 0,
                parentId: null,
                createdAt: serverTimestamp(),
            });
        }
    }

    return postDoc.id;
}

// ============ ADMIN USER DETAIL ============

export interface UserDebate {
    id: string;
    topic: string;
    topicAngle: string;
    createdAt: Date;
    status: string;
    phrasesTotal: number;
    phrasesUsed: number;
    phrasesNatural: number;
    turnsCount: number;
}

export async function getUserDebates(userId: string): Promise<UserDebate[]> {
    const firestore = checkDb();
    const debatesRef = collection(firestore, 'debates');
    const q = query(
        debatesRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const phrases = data.phrases || [];
        return {
            id: doc.id,
            topic: data.topic || 'Untitled',
            topicAngle: data.topicAngle || '',
            createdAt: data.createdAt?.toDate() || new Date(),
            status: data.status || 'unknown',
            phrasesTotal: phrases.length,
            phrasesUsed: phrases.filter((p: { used?: boolean }) => p.used).length,
            phrasesNatural: phrases.filter((p: { status?: string }) => p.status === 'natural').length,
            turnsCount: (data.turns || []).length,
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
    const firestore = checkDb();
    const postsRef = collection(firestore, 'posts');
    const q = query(
        postsRef,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            title: data.title,
            content: data.content || '',
            isArticle: data.isArticle || false,
            createdAt: data.createdAt?.toDate() || new Date(),
            commentCount: data.commentCount || 0,
            repostCount: data.repostCount || 0,
        };
    });
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
    const firestore = checkDb();
    const usageRef = collection(firestore, 'tokenUsage');
    const q = query(usageRef, where('userEmail', '==', userEmail));
    const snapshot = await getDocs(q);

    const byEndpoint: Record<string, { tokens: number; calls: number }> = {};
    let total = 0;
    let calls = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const endpoint = data.endpoint || 'unknown';
        const tokens = data.totalTokens || 0;
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
    const firestore = checkDb();
    const phrasesRef = collection(firestore, 'savedPhrases');
    const q = query(
        phrasesRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            phrase: data.phrase || '',
            meaning: data.meaning || '',
            createdAt: data.createdAt?.toDate() || new Date(),
            usageCount: data.usageCount || 0,
        };
    });
}
