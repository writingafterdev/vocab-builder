import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Client, Databases, Storage } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

// Set your custom Database ID here
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function setupSchema() {
    console.log(`Setting up Appwrite Database ('${DB_ID}') schema...`);

    try {
        await databases.create(DB_ID, 'Main Database');
        console.log(`✅ Created Database: ${DB_ID}`);
    } catch (e: any) {
        if (e.code === 409) console.log(`⏩ Database ${DB_ID} already exists.`);
        else throw e;
    }

    // Define Collections
    const collections = [
        { id: 'users', name: 'Users' },
        { id: 'savedPhrases', name: 'Saved Phrases' },
        { id: 'posts', name: 'Articles / Posts' },
        { id: 'feedQuizzes', name: 'Feed Quizzes' },
        { id: 'batchJobs', name: 'Batch Jobs' },
        { id: 'userWeaknesses', name: 'User Weaknesses' },
        { id: 'quotes', name: 'Extracted Quotes' },
        { id: 'importSources', name: 'Import Sources' },
    ];

    for (const coll of collections) {
        try {
            await databases.createCollection(DB_ID, coll.id, coll.name);
            console.log(`✅ Created Collection: ${coll.id}`);
        } catch (e: any) {
            if (e.code === 409) console.log(`⏩ Collection ${coll.id} already exists.`);
            else throw e;
        }
    }

    console.log('\nCreating Attributes (this may take a few seconds per attribute to process)...');

    const attributes: { collectionId: string, attr: any }[] = [
        // ---------- USERS ----------
        { collectionId: 'users', attr: () => databases.createStringAttribute(DB_ID, 'users', 'email', 255, true) },
        { collectionId: 'users', attr: () => databases.createStringAttribute(DB_ID, 'users', 'displayName', 255, false) },
        { collectionId: 'users', attr: () => databases.createStringAttribute(DB_ID, 'users', 'photoURL', 1000, false) },
        { collectionId: 'users', attr: () => databases.createStringAttribute(DB_ID, 'users', 'stats', 20000, false) }, // JSON
        { collectionId: 'users', attr: () => databases.createStringAttribute(DB_ID, 'users', 'preferences', 20000, false) }, // JSON
        { collectionId: 'users', attr: () => databases.createBooleanAttribute(DB_ID, 'users', 'onboardingCompleted', false, false) },
        { collectionId: 'users', attr: () => databases.createDatetimeAttribute(DB_ID, 'users', 'createdAt', false) },

        // ---------- SAVED PHRASES ----------
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'userId', 255, true) },
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'phrase', 1000, true) },
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'meaning', 5000, false) },
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'register', 255, false) },
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'topics', 255, false, undefined, true) }, // Array
        { collectionId: 'savedPhrases', attr: () => databases.createIntegerAttribute(DB_ID, 'savedPhrases', 'learningStep', false, 0, 10, 0) },
        { collectionId: 'savedPhrases', attr: () => databases.createDatetimeAttribute(DB_ID, 'savedPhrases', 'nextReviewDate', false) },
        { collectionId: 'savedPhrases', attr: () => databases.createStringAttribute(DB_ID, 'savedPhrases', 'completedFormats', 255, false, undefined, true) }, // Array
        { collectionId: 'savedPhrases', attr: () => databases.createDatetimeAttribute(DB_ID, 'savedPhrases', 'createdAt', false) },
        
        // ---------- POSTS ----------
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'title', 1000, true) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'content', 1000000, false) }, // HTML Content VERY Long
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'sourceId', 255, false) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'source', 255, false) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'url', 1000, false) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'topics', 255, false, undefined, true) }, // Array
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'processingStatus', 255, false) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'batchId', 255, false) },
        { collectionId: 'posts', attr: () => databases.createDatetimeAttribute(DB_ID, 'posts', 'createdAt', false) },
        { collectionId: 'posts', attr: () => databases.createStringAttribute(DB_ID, 'posts', 'language', 255, false) },
        
        // ---------- FEED QUIZZES ----------
        { collectionId: 'feedQuizzes', attr: () => databases.createStringAttribute(DB_ID, 'feedQuizzes', 'userId', 255, true) },
        { collectionId: 'feedQuizzes', attr: () => databases.createStringAttribute(DB_ID, 'feedQuizzes', 'date', 255, true) },
        { collectionId: 'feedQuizzes', attr: () => databases.createStringAttribute(DB_ID, 'feedQuizzes', 'questions', 500000, true) }, // Very large JSON
        
        // ---------- BATCH JOBS ----------
        { collectionId: 'batchJobs', attr: () => databases.createStringAttribute(DB_ID, 'batchJobs', 'batchId', 255, true) },
        { collectionId: 'batchJobs', attr: () => databases.createStringAttribute(DB_ID, 'batchJobs', 'status', 255, true) },
        { collectionId: 'batchJobs', attr: () => databases.createStringAttribute(DB_ID, 'batchJobs', 'type', 255, true) },
        { collectionId: 'batchJobs', attr: () => databases.createStringAttribute(DB_ID, 'batchJobs', 'error', 20000, false) },
        
        // ---------- QUOTES ----------
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'text', 5000, true) },
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'meaning', 5000, false) },
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'sourceType', 255, false) },
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'postId', 255, false) },
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'userId', 255, false) },
        { collectionId: 'quotes', attr: () => databases.createStringAttribute(DB_ID, 'quotes', 'tags', 255, false, undefined, true) }, // Array

        // ---------- USER WEAKNESSES ----------
        { collectionId: 'userWeaknesses', attr: () => databases.createStringAttribute(DB_ID, 'userWeaknesses', 'userId', 255, true) },
        { collectionId: 'userWeaknesses', attr: () => databases.createStringAttribute(DB_ID, 'userWeaknesses', 'weaknesses', 100000, false) }, // Large JSON array
        { collectionId: 'userWeaknesses', attr: () => databases.createDatetimeAttribute(DB_ID, 'userWeaknesses', 'createdAt', false) },
        { collectionId: 'userWeaknesses', attr: () => databases.createDatetimeAttribute(DB_ID, 'userWeaknesses', 'updatedAt', false) },
    ];

    for (const { collectionId, attr } of attributes) {
        try {
            await attr();
            console.log(`✅ Created attribute in ${collectionId}`);
        } catch (e: any) {
            if (e.code === 409) console.log(`⏩ Attribute exists in ${collectionId}`);
            else {
                console.error(`❌ Failed to create attribute in ${collectionId}:`, e.message);
            }
        }
        // Appwrite requires a small delay between attribute creations often in Cloud
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n--- Schema Setup Complete ---');
}

setupSchema().catch(console.error);
