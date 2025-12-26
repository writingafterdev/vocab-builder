/**
 * Comments domain module
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
import type { Comment } from './types';

export async function getComments(postId: string): Promise<Comment[]> {
    const firestore = await getDbAsync();
    const commentsRef = collection(firestore, 'comments');
    const q = query(
        commentsRef,
        where('postId', '==', postId),
        where('parentId', '==', null),
        orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
}

export async function getReplies(commentId: string): Promise<Comment[]> {
    const firestore = await getDbAsync();
    const commentsRef = collection(firestore, 'comments');
    const q = query(
        commentsRef,
        where('parentId', '==', commentId),
        orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
}

export async function addComment(
    postId: string,
    authorId: string,
    authorName: string,
    authorUsername: string,
    authorPhotoURL: string | undefined,
    content: string,
    parentId?: string
): Promise<string> {
    const firestore = await getDbAsync();
    const commentsRef = collection(firestore, 'comments');

    const docRef = await addDoc(commentsRef, {
        postId,
        authorId,
        authorName,
        authorUsername,
        authorPhotoURL: authorPhotoURL || null,
        content,
        likeCount: 0,
        replyCount: 0,
        parentId: parentId || null,
        createdAt: serverTimestamp(),
    });

    // Update post comment count
    const postRef = doc(firestore, 'posts', postId);
    await updateDoc(postRef, {
        commentCount: increment(1),
    });

    // If reply, update parent's reply count
    if (parentId) {
        const parentRef = doc(firestore, 'comments', parentId);
        await updateDoc(parentRef, {
            replyCount: increment(1),
        });
    }

    return docRef.id;
}

export async function updateComment(commentId: string, newContent: string): Promise<void> {
    const firestore = await getDbAsync();
    const commentRef = doc(firestore, 'comments', commentId);
    await updateDoc(commentRef, {
        content: newContent,
        updatedAt: serverTimestamp(),
    });
}

export async function deleteComment(commentId: string, postId: string, parentId?: string): Promise<void> {
    const firestore = await getDbAsync();
    const commentRef = doc(firestore, 'comments', commentId);
    await deleteDoc(commentRef);

    // Try to update post's comment count (may fail if post was deleted)
    if (postId) {
        try {
            const postRef = doc(firestore, 'posts', postId);
            await updateDoc(postRef, {
                commentCount: increment(-1),
            });
        } catch {
            // Post may have been deleted - that's ok
        }
    }

    if (parentId) {
        try {
            const parentRef = doc(firestore, 'comments', parentId);
            await updateDoc(parentRef, {
                replyCount: increment(-1),
            });
        } catch {
            // Parent comment may have been deleted - that's ok
        }
    }
}

export async function getUserComments(userId: string): Promise<Comment[]> {
    const firestore = await getDbAsync();
    const commentsRef = collection(firestore, 'comments');
    const q = query(commentsRef, where('authorId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
}
