/**
 * Core database utilities
 */
import { db } from '../firebase';

export { db };

/**
 * Helper to check if db is available
 * Throws error if Firestore is not initialized
 */
export const checkDb = () => {
    if (!db) throw new Error('Firestore not initialized');
    return db;
};
