/**
 * Create the 3 deck-related collections: decks, deckPhrases, userDeckSubscriptions
 */
const { Client, Databases, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const COLLECTIONS = ['decks', 'deckPhrases', 'userDeckSubscriptions'];

async function run() {
    for (const colId of COLLECTIONS) {
        try {
            await db.createCollection(DB_ID, colId, colId, [
                Permission.read(Role.any()),
                Permission.write(Role.any()),
                Permission.create(Role.any()),
                Permission.update(Role.any()),
                Permission.delete(Role.any()),
            ]);
            console.log(`✅ Created: ${colId}`);
        } catch (e) {
            if (e.code === 409) {
                console.log(`⚡ Already exists: ${colId}`);
            } else {
                console.log(`❌ Failed: ${colId} — ${e.message}`);
            }
        }
    }
    console.log('\nDone. Now run: node scripts/setup-appwrite-attributes.js');
}

run().catch(console.error);
