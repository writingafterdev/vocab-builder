/**
 * Comments domain module
 */
import {
    addDocument,
    deleteDocument,
    incrementBy,
    queryCollection,
    serverTimestamp,
    updateDocument,
} from '@/lib/appwrite/client-db';
import type { Comment } from './types';

export async function getComments(postId: string): Promise<Comment[]> {
    const comments = await queryCollection<Comment>('comments', {
        where: [{ field: 'postId', op: '==', value: postId }],
        orderBy: [{ field: 'createdAt', direction: 'asc' }],
    });

    return comments.filter((comment) => {
        const parentId = comment.parentId;
        return parentId === null || parentId === undefined || parentId === '';
    });
}

export async function getReplies(commentId: string): Promise<Comment[]> {
    return queryCollection<Comment>('comments', {
        where: [{ field: 'parentId', op: '==', value: commentId }],
        orderBy: [{ field: 'createdAt', direction: 'asc' }],
    });
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
    const comment = await addDocument<Comment>('comments', {
        postId,
        authorId,
        authorName,
        authorUsername,
        authorPhotoURL: authorPhotoURL || null,
        content,
        likeCount: 0,
        replyCount: 0,
        parentId: parentId || '',
        createdAt: serverTimestamp(),
    });

    // Update post comment count
    await updateDocument('posts', postId, {
        commentCount: incrementBy(1),
    });

    // If reply, update parent's reply count
    if (parentId) {
        await updateDocument('comments', parentId, {
            replyCount: incrementBy(1),
        });
    }

    return comment.id;
}

export async function updateComment(commentId: string, newContent: string): Promise<void> {
    await updateDocument('comments', commentId, {
        content: newContent,
        updatedAt: serverTimestamp(),
    });
}

export async function deleteComment(commentId: string, postId: string, parentId?: string): Promise<void> {
    await deleteDocument('comments', commentId);

    // Try to update post's comment count (may fail if post was deleted)
    if (postId) {
        try {
            await updateDocument('posts', postId, {
                commentCount: incrementBy(-1),
            });
        } catch {
            // Post may have been deleted - that's ok
        }
    }

    if (parentId) {
        try {
            await updateDocument('comments', parentId, {
                replyCount: incrementBy(-1),
            });
        } catch {
            // Parent comment may have been deleted - that's ok
        }
    }
}

export async function getUserComments(userId: string): Promise<Comment[]> {
    return queryCollection<Comment>('comments', {
        where: [{ field: 'authorId', op: '==', value: userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
}
