import 'server-only';
import { Client, Databases, Query, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

// Default to main unless specified in env
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

// ─── Schema Cache ────────────────────────────────────────────────────
// Appwrite requires strict schemas — every field must be a defined attribute.
// This cache fetches collection schemas once and filters + serializes writes 
// automatically, preventing both "Unknown attribute" and type mismatch errors.

interface AttrInfo {
    type: string;   // 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'enum' | 'relationship' | 'ip' | 'email' | 'url'
    array: boolean; // true if the attribute is an array variant
}

const schemaCache = new Map<string, Map<string, AttrInfo>>();
const schemaFetchPromises = new Map<string, Promise<Map<string, AttrInfo>>>();

// Fields that Appwrite manages internally — never write these
const SYSTEM_FIELDS = new Set(['id', '$id', '$createdAt', '$updatedAt', '$permissions', '$databaseId', '$collectionId']);

async function getCollectionSchema(collectionId: string): Promise<Map<string, AttrInfo>> {
    if (schemaCache.has(collectionId)) {
        return schemaCache.get(collectionId)!;
    }

    if (schemaFetchPromises.has(collectionId)) {
        return schemaFetchPromises.get(collectionId)!;
    }

    const fetchPromise = (async () => {
        try {
            const attrs = await databases.listAttributes(DB_ID, collectionId);
            const info = new Map<string, AttrInfo>();
            for (const attr of (attrs as any).attributes || []) {
                if (attr.key && attr.status === 'available') {
                    info.set(attr.key, {
                        type: attr.type || 'string',
                        array: attr.array === true,
                    });
                }
            }
            schemaCache.set(collectionId, info);
            return info;
        } catch (e: any) {
            console.warn(`[DB] Could not fetch schema for ${collectionId}: ${e.message}`);
            return new Map<string, AttrInfo>();
        } finally {
            schemaFetchPromises.delete(collectionId);
        }
    })();

    schemaFetchPromises.set(collectionId, fetchPromise);
    return fetchPromise;
}

/**
 * Prepare data for writing to Appwrite.
 * - Strips system fields (id, $id, etc.)
 * - Drops attributes not in the collection schema
 * - For array-type attributes: keeps value as a real JS array
 * - For string-type attributes: stringifies objects/arrays → JSON strings
 * - For other types: passes value through as-is
 */
const _loggedDrops = new Set<string>();

async function prepareWriteData(collectionId: string, data: Record<string, any>): Promise<Record<string, any>> {
    const schema = await getCollectionSchema(collectionId);

    const result: Record<string, any> = {};
    const dropped: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        // Always strip system fields
        if (SYSTEM_FIELDS.has(key)) continue;

        // If schema is empty (fetch failed), pass all non-system fields with basic serialization
        if (schema.size === 0) {
            if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
                result[key] = JSON.stringify(value);
            } else {
                result[key] = value;
            }
            continue;
        }

        const attrInfo = schema.get(key);
        if (!attrInfo) {
            dropped.push(key);
            continue;
        }

        // Handle value serialization based on attribute type
        if (value === null || value === undefined) {
            result[key] = value;
        } else if (attrInfo.array) {
            // Appwrite array attribute — must be a real JS array
            result[key] = Array.isArray(value) ? value : [value];
        } else if (attrInfo.type === 'string') {
            // String attribute — stringify objects/arrays, pass strings through
            if (typeof value === 'object' && !(value instanceof Date)) {
                result[key] = JSON.stringify(value);
            } else {
                result[key] = String(value);
            }
        } else if (attrInfo.type === 'integer') {
            result[key] = typeof value === 'number' ? Math.round(value) : parseInt(String(value), 10) || 0;
        } else if (attrInfo.type === 'float' || attrInfo.type === 'double') {
            result[key] = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        } else if (attrInfo.type === 'boolean') {
            result[key] = Boolean(value);
        } else {
            // datetime, enum, relationship, etc. — pass through
            result[key] = value;
        }
    }

    if (dropped.length > 0) {
        const dropKey = `${collectionId}:${dropped.sort().join(',')}`;
        if (!_loggedDrops.has(dropKey)) {
            _loggedDrops.add(dropKey);
            console.warn(`[DB] Dropped unknown attributes for ${collectionId}: ${dropped.join(', ')}`);
        }
    }

    return result;
}

// ─── Auto-deserialize: parse JSON strings back to objects on read ─────────────
function sanitizeDocument(doc: any): Record<string, unknown> & { id: string } {
    if (!doc) return null as any;

    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...data } = doc;

    // Auto-parse any string value that looks like JSON (starts with { or [)
    for (const key of Object.keys(data)) {
        const val = data[key];
        if (typeof val === 'string' && val.length > 1) {
            const trimmed = val.trim();
            if ((trimmed[0] === '{' && trimmed[trimmed.length - 1] === '}') ||
                (trimmed[0] === '[' && trimmed[trimmed.length - 1] === ']')) {
                try {
                    data[key] = JSON.parse(trimmed);
                } catch {
                    // Not valid JSON, keep as string
                }
            }
        }
    }

    return { ...data, id: $id } as any;
}

// Polyfill serverTimestamp since Appwrite handles ISO strings naturally
export function serverTimestamp() {
    return new Date().toISOString();
}

/**
 * Sanitize a string into a valid Appwrite document ID.
 * - Max 36 chars
 * - Valid chars: a-z, A-Z, 0-9, underscore
 * - Cannot start with a leading underscore
 */
export function safeDocId(raw: string): string {
    // Strip invalid characters
    let sanitized = raw.replace(/[^a-zA-Z0-9_]/g, '');
    // Remove leading underscores
    sanitized = sanitized.replace(/^_+/, '');
    // Truncate to 36 chars
    return sanitized.slice(0, 36);
}


export async function addDocument(collection: string, data: Record<string, any>, idToken?: string): Promise<string> {
    const id = ID.unique();
    const safe = await prepareWriteData(collection, data);
    await databases.createDocument(DB_ID, collection, id, safe);
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
        const safe = await prepareWriteData(collection, data);
        // If all fields were stripped by prepareWriteData, skip the update
        if (Object.keys(safe).length === 0) return;
        await databases.updateDocument(DB_ID, collection, documentId, safe);
    } catch(e: any) {
        console.error(`Failed to update Appwrite doc ${documentId} in ${collection}:`, e.message);
        throw e;
    }
}

export async function setDocument(collection: string, documentId: string, data: Record<string, any>, idToken?: string): Promise<void> {
    const safe = await prepareWriteData(collection, data);
    try {
        await databases.getDocument(DB_ID, collection, documentId);
        await databases.updateDocument(DB_ID, collection, documentId, safe);
    } catch (e: any) {
        if (e.code === 404) {
            await databases.createDocument(DB_ID, collection, documentId, safe);
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
        if (f.op === 'ARRAY_CONTAINS') queries.push(Query.contains(f.field, f.value as any));
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
