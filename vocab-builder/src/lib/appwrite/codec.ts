import { Timestamp } from './timestamp';

type Primitive = string | number | boolean | null;
type IncrementOperation = { __op: 'increment'; amount: number };
type AppwriteError = { code?: number };
type AppwriteDocumentShape = Record<string, unknown> & { $id?: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const SYSTEM_FIELDS = new Set(['id', '$id', '$createdAt', '$updatedAt', '$permissions', '$databaseId', '$collectionId']);

export type { Primitive, IncrementOperation, AppwriteDocumentShape, AppwriteError };
export { SYSTEM_FIELDS };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

export function isPrimitive(value: unknown): value is Primitive {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function isIncrementOperation(value: unknown): value is IncrementOperation {
    return isPlainObject(value) && value.__op === 'increment' && typeof value.amount === 'number';
}

export function isAppwriteError(error: unknown): error is AppwriteError {
    return typeof error === 'object' && error !== null && 'code' in error;
}

function convertDateLike(key: string, value: unknown): unknown {
    if (typeof value !== 'string' || !ISO_DATE_RE.test(value) || !/(At|Date)$/.test(key)) {
        return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return Timestamp.fromDate(date);
}

function reviveNestedDates(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(reviveNestedDates);
    }

    if (!isPlainObject(value)) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => {
            const revivedValue = reviveNestedDates(nestedValue);
            return [key, convertDateLike(key, revivedValue)];
        })
    );
}

export function deserializeValue(key: string, value: unknown): unknown {
    if (typeof value === 'string' && value.length > 1) {
        const trimmed = value.trim();
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                return reviveNestedDates(JSON.parse(trimmed));
            } catch {
                return convertDateLike(key, value);
            }
        }
    }

    return reviveNestedDates(convertDateLike(key, value));
}

export function sanitizeDocument<T>(doc: AppwriteDocumentShape | null): T | null {
    if (!doc) {
        return null;
    }

    const data = Object.fromEntries(
        Object.entries(doc).filter(([key]) => !key.startsWith('$'))
    );

    const sanitizedEntries = Object.entries(data).map(([key, value]) => [
        key,
        deserializeValue(key, value),
    ]);

    return {
        id: doc.$id,
        ...Object.fromEntries(sanitizedEntries),
    } as T;
}

export function expandDottedPaths(data: Record<string, unknown>): Record<string, unknown> {
    const expanded: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        if (!key.includes('.')) {
            expanded[key] = value;
            continue;
        }

        const segments = key.split('.');
        let cursor: Record<string, unknown> = expanded;

        segments.forEach((segment, index) => {
            if (index === segments.length - 1) {
                cursor[segment] = value;
                return;
            }

            if (!isPlainObject(cursor[segment])) {
                cursor[segment] = {};
            }

            cursor = cursor[segment] as Record<string, unknown>;
        });
    }

    return expanded;
}

export function deepMerge(base: unknown, patch: unknown): unknown {
    if (isIncrementOperation(patch)) {
        const current = typeof base === 'number' ? base : Number(base ?? 0);
        return current + patch.amount;
    }

    if (Array.isArray(patch) || patch instanceof Date || patch instanceof Timestamp || !isPlainObject(patch)) {
        return patch;
    }

    const baseObject = isPlainObject(base) ? base : {};
    const result: Record<string, unknown> = { ...baseObject };

    for (const [key, value] of Object.entries(patch)) {
        result[key] = deepMerge(baseObject[key], value);
    }

    return result;
}

export function serializeValue(value: unknown): unknown {
    if (value instanceof Timestamp) {
        return value.toDate().toISOString();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return [];
        }

        if (value.every((item) => isPrimitive(item) || item instanceof Timestamp || item instanceof Date)) {
            return value.map((item) => serializeValue(item));
        }

        return JSON.stringify(value);
    }

    if (isPlainObject(value)) {
        return JSON.stringify(value);
    }

    return value;
}

export function serializeDocument(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(data)
            .filter(([key]) => !SYSTEM_FIELDS.has(key))
            .map(([key, value]) => [key, serializeValue(value)])
    );
}
