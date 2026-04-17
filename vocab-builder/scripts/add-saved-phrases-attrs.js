const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function createAttr(db, method, collectionId, key, sizeOrReq, required = false) {
    try {
        if (method === 'createStringAttribute') {
            await db[method](DB_ID, collectionId, key, sizeOrReq, required);
            console.log(`  ✅ ${collectionId}.${key} (string)`);
        } else if (method === 'createIntegerAttribute') {
            await db[method](DB_ID, collectionId, key, required, -9999, 9999);
            console.log(`  ✅ ${collectionId}.${key} (integer)`);
        } else if (method === 'createBooleanAttribute') {
            await db[method](DB_ID, collectionId, key, required, sizeOrReq);
            console.log(`  ✅ ${collectionId}.${key} (boolean)`);
        }
        await wait(2000);
    } catch (e) {
        if (e.code === 409) {
            console.log(`  ⚡ ${collectionId}.${key} — already exists`);
        } else {
            console.log(`  ❌ ${collectionId}.${key} — ${e.message}`);
        }
    }
}

async function run() {
    console.log('=== Adding missing savedPhrase attrs ===\n');
    await createAttr(databases, 'createStringAttribute', 'savedPhrases', 'baseForm', 255);
    await createAttr(databases, 'createStringAttribute', 'savedPhrases', 'parentPhraseId', 255);
    await createAttr(databases, 'createIntegerAttribute', 'savedPhrases', 'layer', false);
    await createAttr(databases, 'createBooleanAttribute', 'savedPhrases', 'hasAppearedInExercise', false);
    console.log('Done!');
}

run();
