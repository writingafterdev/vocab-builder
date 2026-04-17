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
        await databases.createStringAttribute(DB_ID, 'savedPhrases', 'potentialUsages', 5000, false);
        console.log("✅ Added potentialUsages attribute to savedPhrases");
    } catch (e) {
        if (e.code === 409) {
            console.log("⚡ potentialUsages currently exists");
        } else {
            console.error("❌ Failed to add potentialUsages:", e.message);
        }
    }
}

run();
