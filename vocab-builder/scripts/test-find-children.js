const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client().setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT).setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function run() {
    try {
        const docs = await databases.listDocuments(DB_ID, 'savedPhrases', [
            Query.limit(100),
            Query.orderDesc('$createdAt')
        ]);
        
        console.log(`Checking last 100 documents for our fake children...`);
        const children = docs.documents.filter(d => d.phrase && d.phrase.includes('fake test phrase'));
        
        if (children.length > 0) {
            console.log(`🎉 SUCCESS! Found our standalone children:`);
            children.forEach(c => {
                console.log(` - ID: ${c.$id}, phrase: "${c.phrase}", parentPhraseId: "${c.parentPhraseId}"`);
            });
        } else {
            console.log(`❌ FAILED. Could not find any newly created children.`);
        }
        
    } catch (e) {
        console.error("❌ Failed:", e.message);
    }
}
run();
