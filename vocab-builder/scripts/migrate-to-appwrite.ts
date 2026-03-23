import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Client, Databases } from 'node-appwrite';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

// Internal parser to avoid `JS Date` object conflicts from `firestore-rest.ts`
function fromFirestoreValue(value: any): any {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue; // Keep as ISO 8601 String for Appwrite
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) {
        return (value.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ('mapValue' in value) {
        const result: any = {};
        for (const [k, v] of Object.entries((value.mapValue.fields || {}))) {
            result[k] = fromFirestoreValue(v);
        }
        return result;
    }
    return null;
}

async function getAllFirebaseDocs(collectionId: string) {
    let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionId}?pageSize=300&key=${FIREBASE_API_KEY}`;
    let allDocs: any[] = [];
    let pageToken = '';
    
    do {
         const currentUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
         const res = await fetch(currentUrl);
         if (res.status === 404) return []; // Empty collection
         if (!res.ok) throw new Error(`Failed to fetch ${collectionId}: ${await res.text()}`);
         const data = await res.json();
         
         if (data.documents) {
             for (const doc of data.documents) {
                 const id = doc.name.split('/').pop();
                 const payload: any = {};
                 for (const [k, v] of Object.entries((doc.fields || {}))) {
                     payload[k] = fromFirestoreValue(v);
                 }
                 allDocs.push({ id, ...payload });
             }
         }
         pageToken = data.nextPageToken;
    } while(pageToken);
    
    return allDocs;
}

async function migrateCollection(collectionName: string) {
    console.log(`\n⏳ Extracting collection: ${collectionName}...`);
    const docs = await getAllFirebaseDocs(collectionName);
    console.log(`📦 Found ${docs.length} documents in Firebase ${collectionName}. Commencing Load to Appwrite...`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    const allowedFields: Record<string, string[]> = {
        users: ['email', 'displayName', 'photoURL', 'stats', 'preferences', 'onboardingCompleted', 'createdAt'],
        savedPhrases: ['userId', 'phrase', 'meaning', 'register', 'topics', 'learningStep', 'nextReviewDate', 'completedFormats', 'createdAt'],
        posts: ['title', 'content', 'sourceId', 'source', 'url', 'topics', 'processingStatus', 'batchId', 'createdAt', 'language'],
        feedQuizzes: ['userId', 'date', 'questions'],
        batchJobs: ['batchId', 'status', 'type', 'error'],
        userWeaknesses: ['userId', 'weaknesses', 'createdAt', 'updatedAt'],
        quotes: ['text', 'meaning', 'sourceType', 'postId', 'userId', 'tags'],
        importSources: [] // Ignored
    };

    for (const doc of docs) {
        let id = doc.id as string;
        // Appwrite ID constraints: max 36 chars, valid chars: a-zA-Z0-9.-_
        id = id.replace(/[^a-zA-Z0-9.\-_]/g, ''); // strip totally invalid characters
        if (id.length > 36) id = id.slice(-36); // Appwrite ID max 36 chars limit
        // Appwrite rejects IDs starting with special characters
        if (/^[^a-zA-Z0-9]/.test(id)) {
            id = 'i' + id.slice(1); // Replace the invalid first char with 'i'
        }

        const { id: _, ...rawPayload } = doc;
        const payload: any = {};
        const allowed = allowedFields[collectionName] || [];

        // STRICT SCHEMA FILTERING: Strip any legacy arbitrary fields to prevent Appwrite rejection!
        for (const key of allowed) {
             if (rawPayload[key] !== undefined) {
                 payload[key] = rawPayload[key];
             }
        }
        
        // Transform JSON subsets to conform to Appwrite primitives
        if (collectionName === 'users') {
             if (payload.stats && typeof payload.stats === 'object') payload.stats = JSON.stringify(payload.stats);
             if (payload.preferences && typeof payload.preferences === 'object') payload.preferences = JSON.stringify(payload.preferences);
             if (payload.photoURL === undefined) payload.photoURL = '';
        }

        if (collectionName === 'feedQuizzes') {
             if (payload.questions && typeof payload.questions === 'object') payload.questions = JSON.stringify(payload.questions);
        }

        if (collectionName === 'batchJobs') {
             if (payload.userPhraseMap && typeof payload.userPhraseMap === 'object') payload.userPhraseMap = JSON.stringify(payload.userPhraseMap);
             if (payload.error === undefined) payload.error = '';
        }

        if (collectionName === 'userWeaknesses') {
             if (payload.weaknesses && typeof payload.weaknesses === 'object') payload.weaknesses = JSON.stringify(payload.weaknesses);
        }

        try {
             // Retain unique string identifiers
             await databases.createDocument(DB_ID, collectionName, id, payload);
             success++;
        } catch (e: any) {
             if (e.code === 409) {
                 skipped++; // Document already ported
             } else {
                 console.error(`❌ Failed to push doc ${id} in ${collectionName}:`, e.message);
                 failed++;
             }
        }
    }

    console.log(`✅ [${collectionName}] -> Success: ${success} | Skipped: ${skipped} | Failed: ${failed}`);
}

async function runMigration() {
    const collections = [
        'users',
        'savedPhrases',
        'posts',
        'feedQuizzes',
        'batchJobs',
        'userWeaknesses',
        'quotes',
        'importSources'
    ];

    for (const coll of collections) {
         await migrateCollection(coll);
    }
    
    console.log('\n🚀 --- Full Appwrite Migration Complete ---');
}

runMigration().catch(console.error);
