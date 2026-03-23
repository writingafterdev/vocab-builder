/**
 * Collections module - CRUD operations for admin-managed post collections
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
    orderBy,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
} from '@/lib/firebase/firestore';
import { getDbAsync } from './core';
import type { Collection, Post } from './types';

/**
 * Get all collections
 */
export async function getCollections(): Promise<Collection[]> {
    const firestore = await getDbAsync();
    const collectionsRef = collection(firestore, 'collections');
    const q = query(collectionsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Collection[];
}

/**
 * Get a single collection by ID
 */
export async function getCollection(id: string): Promise<Collection | null> {
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', id);
    const snapshot = await getDoc(collectionRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Collection;
}

/**
 * Create a new collection
 */
export async function createCollection(
    name: string,
    description?: string,
    coverColor?: string
): Promise<string> {
    const firestore = await getDbAsync();
    const collectionsRef = collection(firestore, 'collections');
    const docRef = await addDoc(collectionsRef, {
        name,
        description: description || '',
        coverColor: coverColor || 'blue',
        postIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
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
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', id);
    await updateDoc(collectionRef, {
        ...updates,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Delete a collection
 */
export async function deleteCollection(id: string): Promise<void> {
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', id);
    await deleteDoc(collectionRef);
}

/**
 * Add a post to a collection
 */
export async function addPostToCollection(
    collectionId: string,
    postId: string
): Promise<void> {
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', collectionId);
    await updateDoc(collectionRef, {
        postIds: arrayUnion(postId),
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
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', collectionId);
    await updateDoc(collectionRef, {
        postIds: arrayRemove(postId),
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
    const firestore = await getDbAsync();
    const collectionRef = doc(firestore, 'collections', id);
    const collectionSnap = await getDoc(collectionRef);

    if (!collectionSnap.exists()) return null;

    const collectionData = { id: collectionSnap.id, ...collectionSnap.data() } as Collection;

    // Fetch all posts in the collection
    const posts: Post[] = [];
    for (const postId of collectionData.postIds) {
        const postRef = doc(firestore, 'posts', postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            posts.push({ id: postSnap.id, ...postSnap.data() } as Post);
        }
    }

    return { collection: collectionData, posts };
}
