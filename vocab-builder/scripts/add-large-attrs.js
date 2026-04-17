const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function run() {
    try {
        await databases.createStringAttribute(DB_ID, 'savedPhrases', 'potentialUsages', 100000, false);
        console.log("✅ Added potentialUsages attribute (100000)");
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}
run();
