/**
 * Add import-related attributes to savedPhrases collection
 * 
 * Run: node scripts/add-import-attrs.js
 * 
 * Adds: source, importBatchId, importedAt
 * These are needed for the bulk import feature.
 */
const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function createStringAttr(collectionId, key, size, required = false) {
    try {
        await databases.createStringAttribute(DB_ID, collectionId, key, size, required);
        console.log(`  ✅ ${collectionId}.${key} (string:${size})`);
        await wait(1500);
    } catch (e) {
        if (e.code === 409) {
            console.log(`  ⚡ ${collectionId}.${key} — already exists`);
        } else {
            console.log(`  ❌ ${collectionId}.${key} — ${e.message}`);
        }
    }
}

async function run() {
    console.log('=== Adding import-related attributes to savedPhrases ===\n');

    // New attributes for bulk import feature
    await createStringAttr('savedPhrases', 'source', 50);           // 'import' | 'reading' | null
    await createStringAttr('savedPhrases', 'importBatchId', 100);   // imp_<timestamp>
    await createStringAttr('savedPhrases', 'importedAt', 100);      // ISO string

    console.log('\n✅ Done! Import attributes added to savedPhrases.');
}

run();
