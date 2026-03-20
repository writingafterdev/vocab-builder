/**
 * Firestore REST API wrapper for Cloudflare Workers
 * Replaces Firebase SDK calls which don't work in Workers due to eval() restrictions
 */

function getFirebaseProjectId() { return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; }
function getFirebaseApiKey() { return process.env.NEXT_PUBLIC_FIREBASE_API_KEY; }
function getFirestoreBaseUrl() { return `https://firestore.googleapis.com/v1/projects/${getFirebaseProjectId()}/databases/(default)/documents`; }

/** Append API key to a URL string for authenticated REST access */
function withKey(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    const apiKey = getFirebaseApiKey();
    return apiKey ? `${url}${separator}key=${apiKey}` : url;
}

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
    data: Record<string, unknown>,
    idToken?: string
): Promise<string> {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(withKey(`${getFirestoreBaseUrl()}/${collectionPath}`), {
        method: 'POST',
        headers,
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
    documentId: string,
    idToken?: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
    const headers: Record<string, string> = {};
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(withKey(`${getFirestoreBaseUrl()}/${collectionPath}/${documentId}`), {
        headers
    });

    if (response.status === 404) {
        return null;
    }

    // Firestore often returns 403 for non-existent documents (depends on security rules)
    // Treat this as "not found" rather than an error
    if (response.status === 403) {
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
    data: Record<string, unknown>,
    idToken?: string
): Promise<void> {
    const fields: Record<string, FirestoreValue> = {};
    const updateMask: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
        updateMask.push(key);
    }

    const url = new URL(`${getFirestoreBaseUrl()}/${collectionPath}/${documentId}`);
    updateMask.forEach(field => url.searchParams.append('updateMask.fieldPaths', field));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(withKey(url.toString()), {
        method: 'PATCH',
        headers,
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
    data: Record<string, unknown>,
    idToken?: string
): Promise<void> {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, value] of Object.entries(data)) {
        fields[key] = toFirestoreValue(value);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(withKey(`${getFirestoreBaseUrl()}/${collectionPath}/${documentId}`), {
        method: 'PATCH',
        headers,
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
    const response = await fetch(withKey(`${getFirestoreBaseUrl()}/${collectionPath}/${documentId}`), {
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
    },
    idToken?: string
): Promise<Array<Record<string, unknown> & { id: string }>> {
    // For simple queries, use REST API
    // Complex queries would need the runQuery endpoint

    const url = new URL(`${getFirestoreBaseUrl()}/${collectionPath}`);
    if (options?.limit) {
        url.searchParams.set('pageSize', options.limit.toString());
    }

    const headers: Record<string, string> = {};
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(withKey(url.toString()), { headers });

    // REST API returns 404 for empty collections
    if (response.status === 404) {
        return [];
    }

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore queryCollection error:', error);
        throw new Error(`Failed to query collection: ${response.status}`);
    }

    const result = await response.json();
    return (result.documents || []).map(documentToObject);
}

/**
 * Execute a structured query via REST API (needed for filtering)
 * Supports both simple collection names and full paths like "users/{userId}/savedPhrases"
 */
export async function runQuery(
    collectionPath: string,
    filters: { field: string; op: 'EQUAL' | 'ARRAY_CONTAINS' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'NOT_EQUAL'; value: unknown }[],
    limit?: number
): Promise<Array<Record<string, unknown> & { id: string }>> {
    // Parse the collection path - it could be "savedPhrases" or "users/{userId}/savedPhrases"
    const pathParts = collectionPath.split('/');
    const collectionId = pathParts[pathParts.length - 1]; // Last segment is the collection
    const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : null;

    const structuredQuery: any = {
        from: [{ collectionId }]
    };

    if (filters.length > 0) {
        if (filters.length === 1) {
            const f = filters[0];
            structuredQuery.where = {
                fieldFilter: {
                    field: { fieldPath: f.field },
                    op: f.op,
                    value: toFirestoreValue(f.value)
                }
            };
        } else {
            // Composite filter (AND)
            structuredQuery.where = {
                compositeFilter: {
                    op: 'AND',
                    filters: filters.map(f => ({
                        fieldFilter: {
                            field: { fieldPath: f.field },
                            op: f.op,
                            value: toFirestoreValue(f.value)
                        }
                    }))
                }
            };
        }
    }

    if (limit) {
        structuredQuery.limit = limit;
    }

    // Build the URL - if there's a parent path, include it
    const baseUrl = parentPath
        ? `${getFirestoreBaseUrl()}/${parentPath}:runQuery`
        : `${getFirestoreBaseUrl()}:runQuery`;

    const response = await fetch(withKey(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery })
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Firestore runQuery error:', error);
        throw new Error(`Failed to run query: ${response.status}`);
    }

    const result = await response.json();

    // runQuery returns a stream of results, slightly different format
    // Each item has "document": { ... } or "readTime" (if no results or end of stream)
    return result
        .filter((item: any) => item.document)
        .map((item: any) => documentToObject(item.document));
}

/**
 * Get current timestamp in Firestore format
 */
export function serverTimestamp(): string {
    return new Date().toISOString();
}
