const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client();
client
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

async function run() {
    try {
        console.log('Fetching importSources...');
        const res = await databases.listDocuments(DB_ID, 'importSources');
        console.log(`Found ${res.documents.length} sources.`);
        
        for (const doc of res.documents) {
            await databases.deleteDocument(DB_ID, 'importSources', doc.$id);
            console.log(`Deleted ${doc.$id}`);
        }
        console.log('All import sources cleared.');
    } catch (e) {
        console.error(e);
    }
}
run();
