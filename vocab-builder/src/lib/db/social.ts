/**
 * Social interactions domain module (Likes, Reposts)
 */
import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    increment,
    serverTimestamp,
} from 'firebase/firestore';
import { getDbAsync } from './core';
import type { Repost } from './types';

// ============ LIKES ============

export async function likeComment(commentId: string, userId: string): Promise<void> {
    const firestore = await getDbAsync();
    const likesRef = collection(firestore, 'commentLikes');
    const q = query(likesRef, where('commentId', '==', commentId), where('userId', '==', userId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        // Unlike
        await deleteDoc(snapshot.docs[0].ref);
        const commentRef = doc(firestore, 'comments', commentId);
        await updateDoc(commentRef, { likeCount: increment(-1) });
    } else {
        // Like
        await addDoc(likesRef, {
            commentId,
            userId,
            createdAt: serverTimestamp(),
        });
        const commentRef = doc(firestore, 'comments', commentId);
        await updateDoc(commentRef, { likeCount: increment(1) });
    }
}

export async function hasUserLikedComment(commentId: string, userId: string): Promise<boolean> {
    const firestore = await getDbAsync();
    const likesRef = collection(firestore, 'commentLikes');
    const q = query(likesRef, where('commentId', '==', commentId), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

/**
 * Batch check which comments a user has liked (1 query instead of N)
 * Returns a Set of commentIds that the user has liked
 */
export async function getBatchUserLikes(commentIds: string[], userId: string): Promise<Set<string>> {
    if (!commentIds.length || !userId) return new Set();

    const firestore = await getDbAsync();
    const likesRef = collection(firestore, 'commentLikes');

    // Firestore 'in' queries support up to 30 items
    const chunks: string[][] = [];
    for (let i = 0; i < commentIds.length; i += 30) {
        chunks.push(commentIds.slice(i, i + 30));
    }

    const likedCommentIds = new Set<string>();

    for (const chunk of chunks) {
        const q = query(
            likesRef,
            where('userId', '==', userId),
            where('commentId', 'in', chunk)
        );
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            likedCommentIds.add(data.commentId);
        });
    }

    return likedCommentIds;
}

// ============ REPOSTS ============

export async function repostPost(postId: string, userId: string): Promise<void> {
    const firestore = await getDbAsync();
    const repostsRef = collection(firestore, 'reposts');
    const q = query(repostsRef, where('postId', '==', postId), where('userId', '==', userId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        // Unrepost
        await deleteDoc(snapshot.docs[0].ref);
        const postRef = doc(firestore, 'posts', postId);
        await updateDoc(postRef, { repostCount: increment(-1) });
    } else {
        // Repost
        await addDoc(repostsRef, {
            postId,
            userId,
            createdAt: serverTimestamp(),
        });
        const postRef = doc(firestore, 'posts', postId);
        await updateDoc(postRef, { repostCount: increment(1) });
    }
}

export async function hasUserReposted(postId: string, userId: string): Promise<boolean> {
    const firestore = await getDbAsync();
    const repostsRef = collection(firestore, 'reposts');
    const q = query(repostsRef, where('postId', '==', postId), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

/**
 * Batch check which posts a user has reposted (1 query instead of N)
 */
export async function getBatchUserReposts(postIds: string[], userId: string): Promise<Set<string>> {
    if (!postIds.length || !userId) return new Set();

    const firestore = await getDbAsync();
    const repostsRef = collection(firestore, 'reposts');

    // Firestore 'in' queries support up to 30 items
    const chunks: string[][] = [];
    for (let i = 0; i < postIds.length; i += 30) {
        chunks.push(postIds.slice(i, i + 30));
    }

    const repostedPostIds = new Set<string>();

    for (const chunk of chunks) {
        const q = query(
            repostsRef,
            where('userId', '==', userId),
            where('postId', 'in', chunk)
        );
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            repostedPostIds.add(data.postId);
        });
    }

    return repostedPostIds;
}

export async function getUserReposts(userId: string): Promise<Repost[]> {
    const firestore = await getDbAsync();
    const repostsRef = collection(firestore, 'reposts');
    const q = query(repostsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Repost));
}
