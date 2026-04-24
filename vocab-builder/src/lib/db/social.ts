/**
 * Social interactions domain module (Likes, Reposts)
 */
import {
    addDocument,
    deleteDocument,
    incrementBy,
    queryCollection,
    serverTimestamp,
    updateDocument,
} from '@/lib/appwrite/client-db';
import type { Repost } from './types';

// ============ LIKES ============

export async function likeComment(commentId: string, userId: string): Promise<void> {
    const likes = await queryCollection<{ id: string }>('commentLikes', {
        where: [
            { field: 'commentId', op: '==', value: commentId },
            { field: 'userId', op: '==', value: userId },
        ],
        limit: 1,
    });

    if (likes.length > 0) {
        // Unlike
        await deleteDocument('commentLikes', likes[0].id);
        await updateDocument('comments', commentId, { likeCount: incrementBy(-1) });
    } else {
        // Like
        await addDocument('commentLikes', {
            commentId,
            userId,
            createdAt: serverTimestamp(),
        });
        await updateDocument('comments', commentId, { likeCount: incrementBy(1) });
    }
}

export async function hasUserLikedComment(commentId: string, userId: string): Promise<boolean> {
    const likes = await queryCollection('commentLikes', {
        where: [
            { field: 'commentId', op: '==', value: commentId },
            { field: 'userId', op: '==', value: userId },
        ],
        limit: 1,
    });
    return likes.length > 0;
}

/**
 * Batch check which comments a user has liked (1 query instead of N)
 * Returns a Set of commentIds that the user has liked
 */
export async function getBatchUserLikes(commentIds: string[], userId: string): Promise<Set<string>> {
    if (!commentIds.length || !userId) return new Set();

    const chunks: string[][] = [];
    for (let i = 0; i < commentIds.length; i += 30) {
        chunks.push(commentIds.slice(i, i + 30));
    }

    const likedCommentIds = new Set<string>();

    for (const chunk of chunks) {
        const likes = await queryCollection<{ commentId: string }>('commentLikes', {
            where: [
                { field: 'userId', op: '==', value: userId },
                { field: 'commentId', op: 'in', value: chunk },
            ],
        });

        likes.forEach((like) => {
            likedCommentIds.add(like.commentId);
        });
    }

    return likedCommentIds;
}

// ============ REPOSTS ============

export async function repostPost(postId: string, userId: string): Promise<void> {
    const reposts = await queryCollection<{ id: string }>('reposts', {
        where: [
            { field: 'postId', op: '==', value: postId },
            { field: 'userId', op: '==', value: userId },
        ],
        limit: 1,
    });

    if (reposts.length > 0) {
        // Unrepost
        await deleteDocument('reposts', reposts[0].id);
        await updateDocument('posts', postId, { repostCount: incrementBy(-1) });
    } else {
        // Repost
        await addDocument('reposts', {
            postId,
            userId,
            createdAt: serverTimestamp(),
        });
        await updateDocument('posts', postId, { repostCount: incrementBy(1) });
    }
}

export async function hasUserReposted(postId: string, userId: string): Promise<boolean> {
    const reposts = await queryCollection('reposts', {
        where: [
            { field: 'postId', op: '==', value: postId },
            { field: 'userId', op: '==', value: userId },
        ],
        limit: 1,
    });
    return reposts.length > 0;
}

/**
 * Batch check which posts a user has reposted (1 query instead of N)
 */
export async function getBatchUserReposts(postIds: string[], userId: string): Promise<Set<string>> {
    if (!postIds.length || !userId) return new Set();

    const chunks: string[][] = [];
    for (let i = 0; i < postIds.length; i += 30) {
        chunks.push(postIds.slice(i, i + 30));
    }

    const repostedPostIds = new Set<string>();

    for (const chunk of chunks) {
        const reposts = await queryCollection<{ postId: string }>('reposts', {
            where: [
                { field: 'userId', op: '==', value: userId },
                { field: 'postId', op: 'in', value: chunk },
            ],
        });

        reposts.forEach((repost) => {
            repostedPostIds.add(repost.postId);
        });
    }

    return repostedPostIds;
}

export async function getUserReposts(userId: string): Promise<Repost[]> {
    return queryCollection<Repost>('reposts', {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
}
