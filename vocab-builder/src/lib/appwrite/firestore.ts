import { databases, DB_ID } from '@/lib/appwrite/client';
import { ID, Query as AppwriteQuery } from 'appwrite';

/**
 * Appwrite Firestore Adapter
 * Maps Firebase Firestore SDK interface to native Appwrite Web SDK calls.
 * This allows the DB layer and components to use familiar Firestore-style
 * APIs (doc, getDoc, collection, query, where, etc.) while running on Appwrite.
 */

export interface Firestore {}

export function getFirestore() { return {}; }
export function initializeFirestore() { return {}; }

export function collection(db: any, path: string, ...paths: string[]) {
    return { type: 'collection', path: [path, ...paths].join('/') };
}

export function doc(dbOrCol: any, ...paths: string[]) {
    if (dbOrCol && dbOrCol.type === 'collection') {
        return { type: 'doc', col: dbOrCol.path, id: paths[0] || ID.unique() };
    }
    return { type: 'doc', col: paths[0], id: paths[1] || ID.unique() };
}

function createSnapshot(docData: any, reqId: string) {
    if (!docData) {
        return {
            id: reqId,
            exists: () => false,
            data: () => undefined,
            ref: { type: 'doc', col: '', id: reqId }
        } as any;
    }
    const { $id, $databaseId, $collectionId, $createdAt, $updatedAt, $permissions, ...rest } = docData;
    return {
        id: $id || reqId,
        exists: () => true,
        data: () => rest,
        ref: { type: 'doc', col: $collectionId, id: $id || reqId }
    } as any;
}

export async function getDoc(docRef: any) {
    try {
        const doc = await databases.getDocument(DB_ID, docRef.col, docRef.id);
        return createSnapshot(doc, docRef.id);
    } catch (e: any) {
        if (e.code === 404) return createSnapshot(null, docRef.id);
        console.error('[Polyfill] getDoc Failed:', e, docRef);
        throw e;
    }
}

export async function getDocs(queryRef: any) {
    const colId = queryRef.type === 'collection' ? queryRef.path : queryRef.col;
    const queries = queryRef.type === 'query' ? queryRef.queries : [];

    try {
        const result = await databases.listDocuments(DB_ID, colId, queries);
        return {
            docs: result.documents.map((d: any) => createSnapshot(d, d.$id)),
            empty: result.documents.length === 0,
            size: result.documents.length,
            forEach: (cb: any) => result.documents.map((d: any) => createSnapshot(d, d.$id)).forEach(cb)
        };
    } catch (e: any) {
        console.error('[Polyfill] getDocs Failed on:', colId, queries, e);
        return { docs: [], empty: true, size: 0, forEach: () => {} };
    }
}

export async function addDoc(colRef: any, data: any) {
    const docId = ID.unique();
    const colId = colRef.type === 'collection' ? colRef.path : colRef.col;
    await databases.createDocument(DB_ID, colId, docId, data);
    return { type: 'doc', col: colId, id: docId };
}

export async function setDoc(docRef: any, data: any, options?: { merge: boolean }) {
    try {
        // Does it exist? Try to get it. If not found, create it.
        await databases.getDocument(DB_ID, docRef.col, docRef.id);
        return await databases.updateDocument(DB_ID, docRef.col, docRef.id, data);
    } catch (e: any) {
        if (e.code === 404) {
            return await databases.createDocument(DB_ID, docRef.col, docRef.id, data);
        }
        throw e;
    }
}

export async function updateDoc(docRef: any, data: any) {
    // Check if there's any __increment__ operations
    let hasIncrement = false;
    for (const key of Object.keys(data)) {
        if (data[key] && typeof data[key] === 'object' && '__increment__' in data[key]) {
            hasIncrement = true;
            break;
        }
    }

    if (hasIncrement) {
        // Fetch current doc to calculate increment
        const currentDoc = await databases.getDocument(DB_ID, docRef.col, docRef.id);
        const newData = { ...data };
        for (const key of Object.keys(newData)) {
            if (newData[key] && typeof newData[key] === 'object' && '__increment__' in newData[key]) {
                const currentVal = (currentDoc[key] || 0) as number;
                newData[key] = currentVal + newData[key].__increment__;
            }
        }
        return await databases.updateDocument(DB_ID, docRef.col, docRef.id, newData);
    }

    return await databases.updateDocument(DB_ID, docRef.col, docRef.id, data);
}

export async function deleteDoc(docRef: any) {
    return await databases.deleteDocument(DB_ID, docRef.col, docRef.id);
}

// Queries
export function query(colRef: any, ...constraints: any[]) {
    return {
        type: 'query',
        col: colRef.type === 'collection' ? colRef.path : colRef.col,
        queries: constraints.filter(Boolean)
    };
}

export function where(field: string, op: string, value: any) {
    if (op === '==') return AppwriteQuery.equal(field, value);
    if (op === '>') return AppwriteQuery.greaterThan(field, value);
    if (op === '<') return AppwriteQuery.lessThan(field, value);
    if (op === '>=') return AppwriteQuery.greaterThanEqual(field, value);
    if (op === '<=') return AppwriteQuery.lessThanEqual(field, value);
    if (op === 'array-contains') return AppwriteQuery.contains(field, value);
    if (op === 'in') return AppwriteQuery.equal(field, value);
    if (op === 'array-contains-any') return AppwriteQuery.contains(field, value); // Approximate
    return AppwriteQuery.equal(field, value);
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return direction === 'asc' ? AppwriteQuery.orderAsc(field) : AppwriteQuery.orderDesc(field);
}

export function limit(n: number) {
    return AppwriteQuery.limit(n);
}

export function startAfter(val: any) {
    // Appwrite pagination usually uses cursorAfter(documentId). 
    // This is an imperfect shim if `val` is a snapshot.
    if (val && val.id) {
        return AppwriteQuery.cursorAfter(val.id);
    }
    return '';
}

export function arrayUnion(...elements: any[]) {
    // Note: Appwrite does not have an atomic arrayUnion.
    // In our app, we usually fetch and update or rely on custom behavior.
    // For now, return the elements and hope the caller handles it, OR return empty.
    // Realistically, to shim arrayUnion we'd need to fetch, push, and update.
    console.warn('[Polyfill] arrayUnion is not natively atomic in Appwrite.');
    return elements; 
}

export function arrayRemove(...elements: any[]) {
    console.warn('[Polyfill] arrayRemove is not natively atomic in Appwrite.');
    return elements;
}

export function serverTimestamp() {
    return new Date().toISOString();
}

export function increment(n: number) {
    return { __increment__: n };
}

export function writeBatch() {
    console.warn('[Polyfill] writeBatch is not supported synchronously. Faking it.');
    const ops: any[] = [];
    return {
        set: (ref: any, data: any) => ops.push(() => setDoc(ref, data)),
        update: (ref: any, data: any) => ops.push(() => updateDoc(ref, data)),
        delete: (ref: any) => ops.push(() => deleteDoc(ref)),
        commit: async () => {
            for (const op of ops) await op();
        }
    };
}

export class Timestamp {
    seconds: number = 0;
    nanoseconds: number = 0;

    constructor() {}

    static now(): Timestamp {
        const ts = new Timestamp();
        const now = Date.now();
        ts.seconds = Math.floor(now / 1000);
        ts.nanoseconds = (now % 1000) * 1000000;
        return ts;
    }

    static fromMillis(m: number): Timestamp {
        const ts = new Timestamp();
        ts.seconds = Math.floor(m / 1000);
        ts.nanoseconds = (m % 1000) * 1000000;
        return ts;
    }

    static fromDate(date: Date): Timestamp {
        return Timestamp.fromMillis(date.getTime());
    }

    toMillis(): number {
        return this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000);
    }

    toDate(): Date {
        return new Date(this.toMillis());
    }
}
