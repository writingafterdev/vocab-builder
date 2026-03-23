/**
 * Appwrite Polyfill for Firebase Instances
 * This completely prevents the Google Firebase SDK from loading into the Next.js bundle,
 * cutting down massive amounts of bundle size while maintaining code compatibility.
 */

export async function initializeFirebase() {
    return { app: {} as any, auth, db, storage };
}

export function getFirebaseInstances() {
    return { app: {} as any, auth, db, storage };
}

export const auth: any = { currentUser: null };
export const db: any = {};
export const storage: any = {};
export default {} as any;
