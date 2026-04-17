const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function addUserIdAttr(collectionId) {
    try {
        console.log(`Adding userId attribute to ${collectionId}...`);
        await db.createStringAttribute(
            DB_ID,
            collectionId,
            'userId',
            255,   // Size (enough for user ID string)
            true,  // Required
            undefined, // Default value
            false  // Is Array
        );
        console.log(`✅ Success for ${collectionId}`);
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log(`⚠️ userId already exists on ${collectionId}`);
        } else {
            console.error(`❌ Failed for ${collectionId}:`, e.message);
        }
    }
}

async function run() {
    console.log('--- Starting Schema Fix ---');
    await addUserIdAttr('userProgress');
    await addUserIdAttr('quote_feed_state');
    console.log('--- Done! It may take 10-30 seconds for Appwrite to build the attributes in the background. ---');
}

run();
