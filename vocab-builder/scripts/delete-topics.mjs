// Quick script to delete all topics from Firestore
// Run with: node --experimental-specifier-resolution=node scripts/delete-topics.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteAllTopics() {
    const topicsRef = collection(db, 'topics');
    const snapshot = await getDocs(topicsRef);
    console.log('Found', snapshot.docs.length, 'topics to delete');

    for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'topics', docSnap.id));
        console.log('Deleted:', docSnap.id);
    }
    console.log('✅ All topics deleted! Fresh start.');
    process.exit(0);
}

deleteAllTopics().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
