/**
 * Collections module - CRUD operations for admin-managed post collections
 */
import {
    addDocument,
    deleteDocument,
    getDocument,
    queryCollection,
    serverTimestamp,
    updateDocument,
} from '@/lib/appwrite/client-db';
import type { Collection, Post } from './types';

/**
 * Get all collections
 */
export async function getCollections(): Promise<Collection[]> {
    return queryCollection<Collection>('collections', {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
}

/**
 * Get a single collection by ID
 */
export async function getCollection(id: string): Promise<Collection | null> {
    return getDocument<Collection>('collections', id);
}

/**
 * Create a new collection
 */
export async function createCollection(
    name: string,
    description?: string,
    coverColor?: string
): Promise<string> {
    const createdCollection = await addDocument<Collection>('collections', {
        name,
        description: description || '',
        coverColor: coverColor || 'blue',
        postIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return createdCollection.id;
}

/**
 * Update a collection
 */
export async function updateCollection(
    id: string,
    updates: {
        name?: string;
        description?: string;
        coverColor?: string;
    }
): Promise<void> {
    await updateDocument('collections', id, {
        ...updates,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Delete a collection
 */
export async function deleteCollection(id: string): Promise<void> {
    await deleteDocument('collections', id);
}

/**
 * Add a post to a collection
 */
export async function addPostToCollection(
    collectionId: string,
    postId: string
): Promise<void> {
    const currentCollection = await getDocument<Collection>('collections', collectionId);
    if (!currentCollection) {
        throw new Error('Collection not found');
    }

    const nextPostIds = currentCollection.postIds.includes(postId)
        ? currentCollection.postIds
        : [...currentCollection.postIds, postId];

    await updateDocument('collections', collectionId, {
        postIds: nextPostIds,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Remove a post from a collection
 */
export async function removePostFromCollection(
    collectionId: string,
    postId: string
): Promise<void> {
    const currentCollection = await getDocument<Collection>('collections', collectionId);
    if (!currentCollection) {
        throw new Error('Collection not found');
    }

    await updateDocument('collections', collectionId, {
        postIds: currentCollection.postIds.filter((id) => id !== postId),
        updatedAt: serverTimestamp(),
    });
}

/**
 * Get collection with populated posts
 */
export async function getCollectionWithPosts(id: string): Promise<{
    collection: Collection;
    posts: Post[];
} | null> {
    const collectionData = await getDocument<Collection>('collections', id);
    if (!collectionData) return null;

    // Fetch all posts in the collection
    const posts: Post[] = [];
    for (const postId of collectionData.postIds) {
        const post = await getDocument<Post>('posts', postId);
        if (post) {
            posts.push(post);
        }
    }

    return { collection: collectionData, posts };
}
