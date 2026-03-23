/**
 * Reading Lists module - User-owned reading lists (cloned or created)
 */
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
} from '@/lib/firebase/firestore';
import { getDbAsync } from './core';
import type { UserReadingList, Collection } from './types';

const COLLECTION_NAME = 'userReadingLists';

/**
 * Get all reading lists for a user
 */
export async function getUserReadingLists(userId: string): Promise<UserReadingList[]> {
    const firestore = await getDbAsync();
    const listsRef = collection(firestore, COLLECTION_NAME);
    const q = query(
        listsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserReadingList[];
}

/**
 * Get public reading lists for a user (for profile display)
 */
export async function getPublicReadingLists(userId: string): Promise<UserReadingList[]> {
    const firestore = await getDbAsync();
    const listsRef = collection(firestore, COLLECTION_NAME);
    const q = query(
        listsRef,
        where('userId', '==', userId),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserReadingList[];
}

/**
 * Get a single reading list by ID
 */
export async function getReadingList(id: string): Promise<UserReadingList | null> {
    const firestore = await getDbAsync();
    const listRef = doc(firestore, COLLECTION_NAME, id);
    const snapshot = await getDoc(listRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as UserReadingList;
}

/**
 * Clone an admin collection to user's library
 */
export async function cloneCollection(
    userId: string,
    collectionId: string
): Promise<string> {
    const firestore = await getDbAsync();

    // Get the source collection
    const collectionRef = doc(firestore, 'collections', collectionId);
    const collectionSnap = await getDoc(collectionRef);

    if (!collectionSnap.exists()) {
        throw new Error('Collection not found');
    }

    const sourceCollection = collectionSnap.data() as Collection;

    // Create user's copy
    const listsRef = collection(firestore, COLLECTION_NAME);
    const docRef = await addDoc(listsRef, {
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

    return docRef.id;
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
    const firestore = await getDbAsync();
    const listsRef = collection(firestore, COLLECTION_NAME);
    const docRef = await addDoc(listsRef, {
        userId,
        name,
        description: description || '',
        coverColor: coverColor || 'blue',
        postIds: [],
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
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
    const firestore = await getDbAsync();
    const listRef = doc(firestore, COLLECTION_NAME, id);
    await updateDoc(listRef, {
        ...updates,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Delete a reading list
 */
export async function deleteReadingList(id: string): Promise<void> {
    const firestore = await getDbAsync();
    const listRef = doc(firestore, COLLECTION_NAME, id);
    await deleteDoc(listRef);
}

/**
 * Add a post to a reading list
 */
export async function addPostToReadingList(
    listId: string,
    postId: string
): Promise<void> {
    const firestore = await getDbAsync();
    const listRef = doc(firestore, COLLECTION_NAME, listId);
    const list = await getDoc(listRef);

    if (!list.exists()) {
        throw new Error('Reading list not found');
    }

    const currentPosts = list.data().postIds || [];
    if (!currentPosts.includes(postId)) {
        await updateDoc(listRef, {
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
    const firestore = await getDbAsync();
    const listRef = doc(firestore, COLLECTION_NAME, listId);
    const list = await getDoc(listRef);

    if (!list.exists()) {
        throw new Error('Reading list not found');
    }

    const currentPosts = list.data().postIds || [];
    await updateDoc(listRef, {
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
    const firestore = await getDbAsync();
    const listsRef = collection(firestore, COLLECTION_NAME);
    const q = query(
        listsRef,
        where('userId', '==', userId),
        where('sourceId', '==', collectionId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}
