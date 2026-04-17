const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';
(async () => {
    let response = await databases.listDocuments(DB_ID, 'batchJobs');
    for (let d of response.documents) {
        console.log(`ID: ${d.$id}, Type: ${d.type}, Name: ${d.name}, Batch: ${d.batchId}, Submitted: ${d.submittedAt}`);
    }
})();
