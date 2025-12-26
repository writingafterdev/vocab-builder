// Firebase client-side singleton
// Uses lazy initialization to avoid Cloudflare Workers bundling issues

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let initialized = false;

/**
 * Lazily initialize Firebase - only call this from client-side code!
 * This function dynamically imports Firebase to avoid bundling on server.
 */
export async function initializeFirebase() {
    // Only run on client
    if (typeof window === 'undefined') {
        return { app: undefined, auth: undefined, db: undefined, storage: undefined };
    }

    // Return cached instances if already initialized
    if (initialized) {
        return { app, auth, db, storage };
    }

    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    if (!firebaseConfig.apiKey) {
        console.error('❌ Firebase API key is missing!');
        return { app: undefined, auth: undefined, db: undefined, storage: undefined };
    }

    // Dynamic imports to avoid server-side bundling
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const { getFirestore } = await import('firebase/firestore');
    const { getStorage } = await import('firebase/storage');

    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    initialized = true;

    return { app, auth, db, storage };
}

/**
 * Get Firebase instances (sync) - may return undefined if not initialized
 * Use initializeFirebase() for guaranteed initialization
 */
export function getFirebaseInstances() {
    return { app, auth, db, storage };
}

// For backward compatibility - these will be undefined until initializeFirebase is called
export { auth, db, storage };
export default app;
