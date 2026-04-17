const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });
const client = new Client().setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT).setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function createAttr(db, method, key, sizeOrReq, required = false) {
    try {
        if (method === 'createStringAttribute') await db[method](DB_ID, 'savedPhrases', key, sizeOrReq, required);
        else if (method === 'createIntegerAttribute') await db[method](DB_ID, 'savedPhrases', key, required, -99999, 99999);
        else if (method === 'createBooleanAttribute') await db[method](DB_ID, 'savedPhrases', key, required, sizeOrReq);
        else if (method === 'createDatetimeAttribute') await db[method](DB_ID, 'savedPhrases', key, required);
        console.log(`✅ added ${key}`);
        await wait(1500);
    } catch (e) {
        console.log(e.code === 409 ? `⚡ ${key} exists` : `❌ ${key} failed: ${e.message}`);
    }
}

async function run() {
    await createAttr(databases, 'createStringAttribute', 'children', 1000000);
    await createAttr(databases, 'createStringAttribute', 'contexts', 1000000);
    await createAttr(databases, 'createStringAttribute', 'nuance', 1000000);
    await createAttr(databases, 'createStringAttribute', 'subtopic', 1000000); // 100k
    await createAttr(databases, 'createStringAttribute', 'subtopics', 1000000); // 100k
    await createAttr(databases, 'createStringAttribute', 'socialDistance', 1000000); // 100k
    await createAttr(databases, 'createIntegerAttribute', 'currentContextIndex', false);
    await createAttr(databases, 'createDatetimeAttribute', 'lastReviewDate', false);
}
run();
