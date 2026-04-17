const { Client, Databases, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function createCollectionsAndAttrs() {
    console.log(`Creating weakness collections in database "${DB_ID}"...`);
    
    const cols = ['questionWeaknesses', 'questionRetryContext'];
    
    for (const colId of cols) {
        try {
            await db.createCollection(
                DB_ID,
                colId,
                colId,
                [
                    Permission.read(Role.users()),
                    Permission.create(Role.users()),
                    Permission.update(Role.users()),
                    Permission.delete(Role.users()),
                ]
            );
            console.log(`✅ Created collection: ${colId}`);
        } catch (e) {
            if (e.code === 409) console.log(`⚡ Collection already exists: ${colId}`);
            else { console.error(`❌ Failed: ${colId} — ${e.message}`); continue; }
        }
    }
    
    // Give time before adding attributes
    await new Promise(r => setTimeout(r, 2000));
    
    const attrs = [
        // questionWeaknesses
        { collection: 'questionWeaknesses', key: 'userId', type: 'string', size: 100 },
        { collection: 'questionWeaknesses', key: 'questionType', type: 'string', size: 50 },
        { collection: 'questionWeaknesses', key: 'totalEncounters', type: 'integer' },
        { collection: 'questionWeaknesses', key: 'totalIncorrect', type: 'integer' },
        { collection: 'questionWeaknesses', key: 'errorRate', type: 'float' },
        { collection: 'questionWeaknesses', key: 'streak', type: 'integer' },
        { collection: 'questionWeaknesses', key: 'lastEncounter', type: 'string', size: 100 },
        { collection: 'questionWeaknesses', key: 'lastUpdated', type: 'string', size: 100 },
        
        // questionRetryContext
        { collection: 'questionRetryContext', key: 'userId', type: 'string', size: 100 },
        { collection: 'questionRetryContext', key: 'questionType', type: 'string', size: 50 },
        { collection: 'questionRetryContext', key: 'vocabPhrase', type: 'string', size: 200 },
        { collection: 'questionRetryContext', key: 'userAnswer', type: 'string', size: 1000 },
        { collection: 'questionRetryContext', key: 'timestamp', type: 'string', size: 100 },
        { collection: 'questionRetryContext', key: 'status', type: 'string', size: 20 },
    ];
    
    for (const attr of attrs) {
        try {
            if (attr.type === 'string') {
                await db.createStringAttribute(DB_ID, attr.collection, attr.key, attr.size, false);
            } else if (attr.type === 'integer') {
                await db.createIntegerAttribute(DB_ID, attr.collection, attr.key, false);
            } else if (attr.type === 'float') {
                await db.createFloatAttribute(DB_ID, attr.collection, attr.key, false);
            }
            console.log(`✅ added ${attr.key} to ${attr.collection}`);
            // Wait to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            if (e.code === 409) console.log(`⚡ ${attr.key} exists on ${attr.collection}`);
            else console.log(`❌ ${attr.key}: ${e.message}`);
        }
    }
}

createCollectionsAndAttrs();
