/**
 * Firestore Database Layer
 * 
 * This file re-exports all functions from domain-specific modules
 * for backward compatibility. New code should import directly from
 * '@/lib/db' or specific domain modules like '@/lib/db/posts'.
 * 
 * Structure:
 * - db/posts.ts     - Post CRUD operations
 * - db/comments.ts  - Comment operations
 * - db/social.ts    - Likes and Reposts
 * - db/srs.ts       - Spaced Repetition System
 * - db/users.ts     - User profile operations
 * - db/admin.ts     - Admin-only operations
 */

// Re-export everything from the new modular structure
export * from './db/types';
export * from './db/posts';
export * from './db/comments';
export * from './db/social';
export * from './db/srs';
export * from './db/users';
export * from './db/admin';
export * from './db/bookmarks';

// Legacy export of db instance for direct access (deprecated)
export { db } from './firebase';
