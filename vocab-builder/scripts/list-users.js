const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function list() {
    try {
        const res = await databases.listDocuments(DB_ID, 'users', [Query.limit(10)]);
        res.documents.forEach(u => console.log(`- Email: ${u.email}`));
    } catch (e) {
        console.error(e);
    }
}
list();
