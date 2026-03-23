/**
 * Appwrite Polyfill for Firebase Instances
 * This completely prevents the Google Firebase SDK from loading into the Next.js bundle,
 * cutting down massive amounts of bundle size while maintaining code compatibility.
 */

export async function initializeFirebase() {
    return { app: {}, auth: {}, db: {}, storage: {} };
}

export function getFirebaseInstances() {
    return { app: {}, auth: {}, db: {}, storage: {} };
}

export const auth = {};
export const db = {};
export const storage = {};
export default {};
