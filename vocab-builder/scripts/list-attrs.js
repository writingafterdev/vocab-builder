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
        const attrs = await databases.listAttributes(DB_ID, 'savedPhrases');
        console.log("Attributes:");
        attrs.attributes.forEach(a => console.log(` - ${a.key} (${a.status})`));
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}

run();
