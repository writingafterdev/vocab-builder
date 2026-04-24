/**
 * Reading Lists module - User-owned reading lists (cloned or created)
 */
import {
    addDocument,
    deleteDocument,
    getDocument,
    queryCollection,
    serverTimestamp,
    updateDocument,
} from '@/lib/appwrite/client-db';
import type { UserReadingList, Collection } from './types';

const COLLECTION_NAME = 'userReadingLists';

/**
 * Get all reading lists for a user
 */
export async function getUserReadingLists(userId: string): Promise<UserReadingList[]> {
    return queryCollection<UserReadingList>(COLLECTION_NAME, {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
}

/**
 * Get public reading lists for a user (for profile display)
 */
export async function getPublicReadingLists(userId: string): Promise<UserReadingList[]> {
    return queryCollection<UserReadingList>(COLLECTION_NAME, {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'isPublic', op: '==', value: true },
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
}

/**
 * Get a single reading list by ID
 */
export async function getReadingList(id: string): Promise<UserReadingList | null> {
    return getDocument<UserReadingList>(COLLECTION_NAME, id);
}

/**
 * Clone an admin collection to user's library
 */
export async function cloneCollection(
    userId: string,
    collectionId: string
): Promise<string> {
    // Get the source collection
    const sourceCollection = await getDocument<Collection>('collections', collectionId);
    if (!sourceCollection) {
        throw new Error('Collection not found');
    }

    // Create user's copy
    const list = await addDocument<UserReadingList>(COLLECTION_NAME, {
        userId,
        name: sourceCollection.name,
        description: sourceCollection.description || '',
        coverColor: sourceCollection.coverColor || 'blue',
        postIds: [...sourceCollection.postIds], // Copy posts
        sourceId: collectionId, // Track where it came from
        isPublic: false, // Private by default
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return list.id;
}

/**
 * Create a new reading list from scratch
 */
export async function createReadingList(
    userId: string,
    name: string,
    description?: string,
    coverColor?: string
): Promise<string> {
    const list = await addDocument<UserReadingList>(COLLECTION_NAME, {
        userId,
        name,
        description: description || '',
        coverColor: coverColor || 'blue',
        postIds: [],
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return list.id;
}

/**
 * Update a reading list
 */
export async function updateReadingList(
    id: string,
    updates: {
        name?: string;
        description?: string;
        coverColor?: string;
        isPublic?: boolean;
    }
): Promise<void> {
    await updateDocument(COLLECTION_NAME, id, {
        ...updates,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Delete a reading list
 */
export async function deleteReadingList(id: string): Promise<void> {
    await deleteDocument(COLLECTION_NAME, id);
}

/**
 * Add a post to a reading list
 */
export async function addPostToReadingList(
    listId: string,
    postId: string
): Promise<void> {
    const list = await getDocument<UserReadingList>(COLLECTION_NAME, listId);
    if (!list) {
        throw new Error('Reading list not found');
    }

    const currentPosts = list.postIds || [];
    if (!currentPosts.includes(postId)) {
        await updateDocument(COLLECTION_NAME, listId, {
            postIds: [...currentPosts, postId],
            updatedAt: serverTimestamp(),
        });
    }
}

/**
 * Remove a post from a reading list
 */
export async function removePostFromReadingList(
    listId: string,
    postId: string
): Promise<void> {
    const list = await getDocument<UserReadingList>(COLLECTION_NAME, listId);
    if (!list) {
        throw new Error('Reading list not found');
    }

    const currentPosts = list.postIds || [];
    await updateDocument(COLLECTION_NAME, listId, {
        postIds: currentPosts.filter((id: string) => id !== postId),
        updatedAt: serverTimestamp(),
    });
}

/**
 * Check if user has already cloned a specific collection
 */
export async function hasClonedCollection(
    userId: string,
    collectionId: string
): Promise<boolean> {
    const lists = await queryCollection<UserReadingList>(COLLECTION_NAME, {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'sourceId', op: '==', value: collectionId },
        ],
        limit: 1,
    });
    return lists.length > 0;
}
