/**
 * Firestore REST API wrapper for Cloudflare Workers
 * Replaces Firebase SDK calls which don't work in Workers due to eval() restrictions
 */

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

interface FirestoreValue {
    stringValue?: string;
    integerValue?: string;
    doubleValue?: number;
    booleanValue?: boolean;
    timestampValue?: string;
    nullValue?: null;
    mapValue?: { fields: Record<string, FirestoreValue> };
    arrayValue?: { values: FirestoreValue[] };
}

interface FirestoreDocument {
    name: string;
    fields: Record<string, FirestoreValue>;
    createTime: string;
    updateTime: string;
}

/**
 * Convert JS value to Firestore REST API format
 */
function toFirestoreValue(value: unknown): FirestoreValue {
    if (value === null || value === undefined) {
        return { nullValue: null };
    }
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return { integerValue: value.toString() };
        }
        return { doubleValue: value };
    }
    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }
    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(toFirestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields: Record<string, FirestoreValue> = {};
        for (const [k, v] of Object.entries(value)) {
            fields[k] = toFirestoreValue(v);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

/**
 * Convert Firestore REST API format to JS value
 */
function fromFirestoreValue(value: FirestoreValue): unknown {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return parseInt(value.integerValue!, 10);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return new Date(value.timestampValue!);
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) {
        return (value.arrayValue!.values || []).map(fromFirestoreValue);
    }
    if ('mapValue' in value) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value.mapValue!.fields || {})) {
            result[k] = fromFirestoreValue(v);
        }
        return result;
    }
    return null;
}

/**
 * Convert Firestore document to plain object
 */
function documentToObject(doc: FirestoreDocument): Record<string, unknown> & { id: string } {
    const id = doc.name.split('/').pop()!;
    const data: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(doc.fields || {})) {
        data[key] = fromFirestoreValue(value);
    }
    return data as Record<string, unknown> & { id: string };
}

/**
 * Add a document to a collection
 */
export async function addDocument(
    collectionPath: string,
    data: Record<string, unknown>
): Promise<string> {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
    }

    const response = await fetch(`${FIRESTORE_BASE_URL}/${collectionPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore addDocument error:', error);
        throw new Error(`Failed to add document: ${response.status}`);
    }

    const result = await response.json();
    return result.name.split('/').pop()!;
}

/**
 * Get a document by ID
 */
export async function getDocument(
    collectionPath: string,
    documentId: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
    const response = await fetch(`${FIRESTORE_BASE_URL}/${collectionPath}/${documentId}`);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore getDocument error:', error);
        throw new Error(`Failed to get document: ${response.status}`);
    }

    const doc = await response.json();
    return documentToObject(doc);
}

/**
 * Update a document (merge)
 */
export async function updateDocument(
    collectionPath: string,
    documentId: string,
    data: Record<string, unknown>
): Promise<void> {
    const fields: Record<string, FirestoreValue> = {};
    const updateMask: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
        updateMask.push(key);
    }

    const url = new URL(`${FIRESTORE_BASE_URL}/${collectionPath}/${documentId}`);
    updateMask.forEach(field => url.searchParams.append('updateMask.fieldPaths', field));

    const response = await fetch(url.toString(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore updateDocument error:', error);
        throw new Error(`Failed to update document: ${response.status}`);
    }
}

/**
 * Set a document (overwrite)
 */
export async function setDocument(
    collectionPath: string,
    documentId: string,
    data: Record<string, unknown>
): Promise<void> {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
    }

    const response = await fetch(`${FIRESTORE_BASE_URL}/${collectionPath}/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore setDocument error:', error);
        throw new Error(`Failed to set document: ${response.status}`);
    }
}

/**
 * Delete a document
 */
export async function deleteDocument(
    collectionPath: string,
    documentId: string
): Promise<void> {
    const response = await fetch(`${FIRESTORE_BASE_URL}/${collectionPath}/${documentId}`, {
        method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
        const error = await response.text();
        console.error('Firestore deleteDocument error:', error);
        throw new Error(`Failed to delete document: ${response.status}`);
    }
}

/**
 * Query a collection (basic query support)
 */
export async function queryCollection(
    collectionPath: string,
    options?: {
        where?: { field: string; op: '==' | '<' | '<=' | '>' | '>=' | '!='; value: unknown }[];
        orderBy?: { field: string; direction?: 'asc' | 'desc' }[];
        limit?: number;
    }
): Promise<Array<Record<string, unknown> & { id: string }>> {
    // For simple queries, use REST API
    // Complex queries would need the runQuery endpoint

    const url = new URL(`${FIRESTORE_BASE_URL}/${collectionPath}`);
    if (options?.limit) {
        url.searchParams.set('pageSize', options.limit.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore queryCollection error:', error);
        throw new Error(`Failed to query collection: ${response.status}`);
    }

    const result = await response.json();
    return (result.documents || []).map(documentToObject);
}

/**
 * Get current timestamp in Firestore format
 */
export function serverTimestamp(): string {
    return new Date().toISOString();
}
