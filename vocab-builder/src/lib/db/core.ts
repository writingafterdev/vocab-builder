/**
 * Core database utilities
 * 
 * ALL CLIENT COMPONENTS should use getDbAsync() for Firebase operations.
 * This ensures Firebase is only loaded dynamically in the browser.
 */
import { initializeFirebase } from '../firebase';
import type { Firestore } from '@/lib/firebase/firestore';

// Re-export initializeFirebase for convenience
export { initializeFirebase };

/**
 * Async helper to get Firestore instance - use this in client components!
 * This ensures Firebase is lazily loaded only on the client side.
 */
export async function getDbAsync(): Promise<Firestore> {
    const { db } = await initializeFirebase();
    if (!db) {
        throw new Error('Firestore not initialized - this should only be called from client side');
    }
    return db;
}

// Legacy sync exports - these will NOT WORK in Cloudflare Workers
// Kept for backward compatibility with code that hasn't been migrated yet
import { db } from '../firebase';

/**
 * @deprecated usage of 'db' directly is unsafe in Cloudflare Workers.
 * Use getDbAsync() instead.
 */
export { db };

/**
 * @deprecated Use getDbAsync() instead for Cloudflare Workers compatibility.
 * This sync check will fail if the app is bundled for edge runtime.
 */
export const checkDb = () => {
    if (!db) throw new Error('Firestore not initialized - use getDbAsync() for client components');
    return db;
};

