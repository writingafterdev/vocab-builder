import { Client, Databases, Query, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

// Default to main unless specified in env
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

// Helper to sanitize Appwrite Document structure back to exactly what our app expects
function sanitizeDocument(doc: any): Record<string, unknown> & { id: string } {
    if (!doc) return null as any;
    
    // Convert special fields
    try {
        if (typeof doc.stats === 'string') doc.stats = JSON.parse(doc.stats);
        if (typeof doc.preferences === 'string') doc.preferences = JSON.parse(doc.preferences);
        if (typeof doc.questions === 'string') doc.questions = JSON.parse(doc.questions);
        if (typeof doc.userPhraseMap === 'string') doc.userPhraseMap = JSON.parse(doc.userPhraseMap);
        if (typeof doc.weaknesses === 'string') doc.weaknesses = JSON.parse(doc.weaknesses);
    } catch {}

    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...data } = doc;
    return { ...data, id: $id } as any;
}

// Polyfill serverTimestamp since Appwrite handles ISO strings naturally
export function serverTimestamp() {
    return new Date().toISOString();
}

export async function addDocument(collection: string, data: Record<string, any>, idToken?: string): Promise<string> {
    const id = ID.unique();
    await databases.createDocument(DB_ID, collection, id, data);
    return id;
}

export async function getDocument(collection: string, documentId: string, idToken?: string): Promise<(Record<string, unknown> & { id: string }) | null> {
    try {
        const doc = await databases.getDocument(DB_ID, collection, documentId);
        return sanitizeDocument(doc);
    } catch (e: any) {
        if (e.code === 404) return null;
        throw e;
    }
}

export async function updateDocument(collection: string, documentId: string, data: Record<string, any>, idToken?: string): Promise<void> {
    try {
        // Appwrite updates only specified fields (PATCH-like behavior natively)
        await databases.updateDocument(DB_ID, collection, documentId, data);
    } catch(e: any) {
        console.error(`Failed to update Appwrite doc ${documentId} in ${collection}:`, e.message);
        throw e;
    }
}

export async function setDocument(collection: string, documentId: string, data: Record<string, any>, idToken?: string): Promise<void> {
    try {
        await databases.getDocument(DB_ID, collection, documentId);
        await databases.updateDocument(DB_ID, collection, documentId, data);
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DB_ID, collection, documentId, data);
        } else {
            throw e;
        }
    }
}

export async function deleteDocument(collection: string, documentId: string, idToken?: string): Promise<void> {
    try {
        await databases.deleteDocument(DB_ID, collection, documentId);
    } catch (e: any) {
        if (e.code !== 404) throw e;
    }
}

// Emulate firestore simple queries.
export async function queryCollection(
    collection: string,
    options?: {
        where?: { field: string; op: '==' | '<' | '<=' | '>' | '>=' | '!='; value: unknown }[];
        orderBy?: { field: string; direction?: 'asc' | 'desc' }[];
        limit?: number;
    },
    idToken?: string
): Promise<Array<Record<string, unknown> & { id: string }>> {
    const queries: string[] = [];
    
    if (options?.where) {
        for (const w of options.where) {
            if (w.op === '==') queries.push(Query.equal(w.field, w.value as string|number|boolean|string[]));
            if (w.op === '<') queries.push(Query.lessThan(w.field, w.value as string|number));
            if (w.op === '<=') queries.push(Query.lessThanEqual(w.field, w.value as string|number));
            if (w.op === '>') queries.push(Query.greaterThan(w.field, w.value as string|number));
            if (w.op === '>=') queries.push(Query.greaterThanEqual(w.field, w.value as string|number));
            if (w.op === '!=') queries.push(Query.notEqual(w.field, w.value as string|number));
        }
    }
    
    if (options?.orderBy) {
        for (const ob of options.orderBy) {
            if (ob.direction === 'desc') queries.push(Query.orderDesc(ob.field));
            else queries.push(Query.orderAsc(ob.field));
        }
    }
    
    if (options?.limit) {
        queries.push(Query.limit(options.limit));
    }

    try {
        const response = await databases.listDocuments(DB_ID, collection, queries);
        return response.documents.map(sanitizeDocument);
    } catch (e: any) {
        throw new Error(`Failed to query ${collection}: ${e.message}`);
    }
}

// Complex Query equivalent mapping
export async function runQuery(
    collectionPath: string,
    filters: { field: string; op: 'EQUAL' | 'ARRAY_CONTAINS' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'NOT_EQUAL'; value: unknown }[],
    limit?: number,
    idToken?: string
): Promise<Array<Record<string, unknown> & { id: string }>> {
    const pathParts = collectionPath.split('/');
    const collectionId = pathParts[pathParts.length - 1];

    const queries: string[] = [];
    for (const f of filters) {
        if (f.op === 'EQUAL') queries.push(Query.equal(f.field, f.value as string|number|boolean|string[]));
        if (f.op === 'ARRAY_CONTAINS') queries.push(Query.contains(f.field, f.value as any)); // Appwrite array search is equal for arrays or contains/search depending on attribute types. Or Query.equal natively works on arrays. We will use Query.search or equal based on need. Let's use equal.
        // Actually Query.equal on array attribute matches if any value is exactly equal! So `Query.equal` is the direct equivalent of `ARRAY_CONTAINS`.
        if (f.op === 'LESS_THAN') queries.push(Query.lessThan(f.field, f.value as string|number));
        if (f.op === 'LESS_THAN_OR_EQUAL') queries.push(Query.lessThanEqual(f.field, f.value as string|number));
        if (f.op === 'GREATER_THAN') queries.push(Query.greaterThan(f.field, f.value as string|number));
        if (f.op === 'GREATER_THAN_OR_EQUAL') queries.push(Query.greaterThanEqual(f.field, f.value as string|number));
        if (f.op === 'NOT_EQUAL') queries.push(Query.notEqual(f.field, f.value as string|number));
    }

    if (limit) queries.push(Query.limit(limit));

    try {
        const response = await databases.listDocuments(DB_ID, collectionId, queries);
        return response.documents.map(sanitizeDocument);
    } catch(e: any) {
        throw new Error(`runQuery failed on ${collectionId}: ${e.message}`);
    }
}
