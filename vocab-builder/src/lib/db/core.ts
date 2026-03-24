/**
 * Core database utilities
 * 
 * The Appwrite adapter (src/lib/appwrite/firestore.ts) handles all database
 * operations internally via the Appwrite SDK. The `db` object passed around
 * is a no-op placeholder maintained for interface compatibility.
 */
import type { Firestore } from '@/lib/appwrite/firestore';

/** No-op database handle — the Appwrite adapter manages its own connection. */
const db = {} as Firestore;

/**
 * Async helper to get database handle — use this in client components.
 * Returns immediately since Appwrite SDK initializes on import.
 */
export async function getDbAsync(): Promise<Firestore> {
    return db;
}

export { db };

export const checkDb = () => db;
