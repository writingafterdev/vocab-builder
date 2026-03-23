import { ID, Query } from 'appwrite';
import { databases, DB_ID } from './client';

/**
 * Polyfill for `serverTimestamp` from Firestore.
 * Appwrite datetime fields expect ISO 8601 strings.
 */
export function serverTimestamp() {
    return new Date().toISOString();
}

/**
 * Appwrite Client Web SDK Generic Database Wrapper
 * Mimics our server-side database wrapper interface but uses the browser-friendly SDK.
 */

export async function addDocument(collectionId: string, data: any, documentId?: string) {
    return await databases.createDocument(
        DB_ID,
        collectionId,
        documentId || ID.unique(),
        data
    );
}

export async function getDocument(collectionId: string, documentId: string) {
    try {
        const doc = await databases.getDocument(DB_ID, collectionId, documentId);
        return doc;
    } catch (e: any) {
        if (e.code === 404) return null;
        throw e;
    }
}

export async function updateDocument(collectionId: string, documentId: string, data: any) {
    // Note: Appwrite only updates provided fields for patch updates
    return await databases.updateDocument(DB_ID, collectionId, documentId, data);
}

export async function setDocument(collectionId: string, documentId: string, data: any) {
    try {
        // Try getting it first to know whether to create or update if it exists
        await databases.getDocument(DB_ID, collectionId, documentId);
        return await updateDocument(collectionId, documentId, data);
    } catch (e: any) {
        if (e.code === 404) {
            return await databases.createDocument(DB_ID, collectionId, documentId, data);
        }
        throw e;
    }
}

export async function deleteDocument(collectionId: string, documentId: string) {
    return await databases.deleteDocument(DB_ID, collectionId, documentId);
}

export async function runQuery(collectionId: string, queries: string[] = []) {
    return await databases.listDocuments(DB_ID, collectionId, queries);
}
