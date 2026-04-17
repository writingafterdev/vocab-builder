const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function run() {
    const toCreate = [
        { collection: 'batchJobs', key: 'name', type: 'string', size: 200 },
        { collection: 'batchJobs', key: 'batchId', type: 'string', size: 200 },
        { collection: 'batchJobs', key: 'provider', type: 'string', size: 100 },
        { collection: 'batchJobs', key: 'type', type: 'string', size: 100 },
        { collection: 'batchJobs', key: 'status', type: 'string', size: 100 },
        { collection: 'batchJobs', key: 'requestCount', type: 'integer' },
        { collection: 'batchJobs', key: 'successCount', type: 'integer' },
        { collection: 'batchJobs', key: 'failCount', type: 'integer' },
        { collection: 'batchJobs', key: 'submittedAt', type: 'string', size: 100 },
        { collection: 'batchJobs', key: 'completedAt', type: 'string', size: 100 },
    ];

    console.log('Adding missing attributes to batchJobs...');
    for (const attr of toCreate) {
        try {
            if (attr.type === 'string') {
                await db.createStringAttribute(DB_ID, attr.collection, attr.key, attr.size, false);
            } else {
                await db.createIntegerAttribute(DB_ID, attr.collection, attr.key, false);
            }
            console.log(`✅ ${attr.key} added`);
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            if (e.code === 409) console.log(`⚡ ${attr.key} exists`);
            else console.log(`❌ ${attr.key}: ${e.message}`);
        }
    }
}

run();
