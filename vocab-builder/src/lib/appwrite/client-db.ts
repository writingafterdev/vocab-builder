import { ID, Query } from 'appwrite';
import { DB_ID, databases } from './client';
import {
    AppwriteDocumentShape,
    IncrementOperation,
    Primitive,
    deepMerge,
    expandDottedPaths,
    isAppwriteError,
    sanitizeDocument,
    serializeDocument,
    serializeValue,
} from './codec';

type QueryScalar = Primitive | Date | Timestamp;
import { Timestamp } from './timestamp';

export type ClientQueryWhere = {
    field: string;
    op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
    value: QueryScalar | QueryScalar[];
};

export type ClientQueryOrder = {
    field: string;
    direction?: 'asc' | 'desc';
};

export type ClientQueryOptions = {
    where?: ClientQueryWhere[];
    orderBy?: ClientQueryOrder[];
    limit?: number;
    cursorAfter?: string;
};

function getTouchedTopLevelKeys(data: Record<string, unknown>): string[] {
    return Array.from(
        new Set(Object.keys(data).map((key) => key.split('.')[0]))
    );
}

function buildQueries(options: ClientQueryOptions = {}): string[] {
    const queries: string[] = [];

    for (const constraint of options.where ?? []) {
        const value = Array.isArray(constraint.value)
            ? constraint.value.map((item) => serializeValue(item) as Primitive)
            : (serializeValue(constraint.value) as Primitive);

        if (constraint.op === '==') queries.push(Query.equal(constraint.field, value as string | number | boolean | string[]));
        if (constraint.op === '!=') queries.push(Query.notEqual(constraint.field, value as string | number));
        if (constraint.op === '<') queries.push(Query.lessThan(constraint.field, value as string | number));
        if (constraint.op === '<=') queries.push(Query.lessThanEqual(constraint.field, value as string | number));
        if (constraint.op === '>') queries.push(Query.greaterThan(constraint.field, value as string | number));
        if (constraint.op === '>=') queries.push(Query.greaterThanEqual(constraint.field, value as string | number));
        if (constraint.op === 'in') queries.push(Query.equal(constraint.field, value as string[]));
        if (constraint.op === 'array-contains') queries.push(Query.contains(constraint.field, value as string));
    }

    for (const order of options.orderBy ?? []) {
        queries.push(order.direction === 'desc' ? Query.orderDesc(order.field) : Query.orderAsc(order.field));
    }

    if (options.limit) {
        queries.push(Query.limit(options.limit));
    }

    if (options.cursorAfter) {
        queries.push(Query.cursorAfter(options.cursorAfter));
    }

    return queries;
}

export function serverTimestamp() {
    return new Date().toISOString();
}

export function incrementBy(amount: number): IncrementOperation {
    return { __op: 'increment', amount };
}

export async function addDocument<T = Record<string, unknown>>(
    collectionId: string,
    data: Record<string, unknown>,
    documentId?: string
): Promise<T & { id: string }> {
    const created = await databases.createDocument(
        DB_ID,
        collectionId,
        documentId || ID.unique(),
        serializeDocument(data)
    );

    return sanitizeDocument<T & { id: string }>(created as unknown as Record<string, unknown>)!;
}

export async function getDocument<T = Record<string, unknown>>(
    collectionId: string,
    documentId: string
): Promise<(T & { id: string }) | null> {
    try {
        const doc = await databases.getDocument(DB_ID, collectionId, documentId);
        return sanitizeDocument<T & { id: string }>(doc as unknown as AppwriteDocumentShape);
    } catch (error: unknown) {
        if (isAppwriteError(error) && error.code === 404) {
            return null;
        }

        throw error;
    }
}

export async function updateDocument(
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>
): Promise<void> {
    const current = await getDocument<Record<string, unknown>>(collectionId, documentId);
    if (!current) {
        throw new Error(`Document ${documentId} not found in ${collectionId}`);
    }

    const expandedPatch = expandDottedPaths(data);
    const merged = deepMerge(current, expandedPatch) as Record<string, unknown>;
    const touchedKeys = getTouchedTopLevelKeys(data);
    const payload = serializeDocument(
        Object.fromEntries(touchedKeys.map((key) => [key, merged[key]]))
    );

    if (Object.keys(payload).length === 0) {
        return;
    }

    await databases.updateDocument(DB_ID, collectionId, documentId, payload);
}

export async function setDocument(
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>
): Promise<void> {
    const payload = serializeDocument(data);

    try {
        await databases.getDocument(DB_ID, collectionId, documentId);
        await databases.updateDocument(DB_ID, collectionId, documentId, payload);
    } catch (error: unknown) {
        if (isAppwriteError(error) && error.code === 404) {
            await databases.createDocument(DB_ID, collectionId, documentId, payload);
            return;
        }

        throw error;
    }
}

export async function deleteDocument(collectionId: string, documentId: string): Promise<void> {
    try {
        await databases.deleteDocument(DB_ID, collectionId, documentId);
    } catch (error: unknown) {
        if (!isAppwriteError(error) || error.code !== 404) {
            throw error;
        }
    }
}

export async function queryCollection<T = Record<string, unknown>>(
    collectionId: string,
    options: ClientQueryOptions = {}
): Promise<Array<T & { id: string }>> {
    const response = await databases.listDocuments(DB_ID, collectionId, buildQueries(options));
    return response.documents
        .map((doc) => sanitizeDocument<T & { id: string }>(doc as unknown as AppwriteDocumentShape))
        .filter(Boolean) as Array<T & { id: string }>;
}
