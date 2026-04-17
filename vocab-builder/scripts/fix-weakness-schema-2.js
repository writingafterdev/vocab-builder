const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function fixWeaknessSchema() {
    console.log('Fixing questionWeaknesses attributes...');

    // Delete wrong attributes I mistakenly added
    const toDelete = [
        'totalEncounters', 'totalIncorrect', 'errorRate', 'streak', 'lastEncounter', 'lastUpdated'
    ];
    for (const attr of toDelete) {
        try {
            await db.deleteAttribute(DB_ID, 'questionWeaknesses', attr);
            console.log(`Deleted wrong attr: ${attr}`);
        } catch (e) {
            console.log(`Skip delete ${attr}: ${e.message}`);
        }
    }

    // Delete unused collection
    try {
        await db.deleteCollection(DB_ID, 'questionRetryContext');
        console.log('Deleted obsolete collection: questionRetryContext');
    } catch (e) {
        console.log(`Skip delete collection: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 6000));

    // Create correct attributes
    const toCreate = [
        { key: 'skillAxis', type: 'string', size: 50 },
        { key: 'wrongCount', type: 'integer' },
        { key: 'correctCount', type: 'integer' },
        { key: 'weight', type: 'float' },
        { key: 'lastWrongAt', type: 'string', size: 50, required: false },
        { key: 'lastCorrectAt', type: 'string', size: 50, required: false },
        { key: 'recentErrors', type: 'string', size: 15000, required: false },
    ];

    for (const attr of toCreate) {
        try {
            if (attr.type === 'string') {
                await db.createStringAttribute(DB_ID, 'questionWeaknesses', attr.key, attr.size, attr.required ?? false);
            } else if (attr.type === 'integer') {
                await db.createIntegerAttribute(DB_ID, 'questionWeaknesses', attr.key, attr.required ?? false);
            } else if (attr.type === 'float') {
                await db.createFloatAttribute(DB_ID, 'questionWeaknesses', attr.key, attr.required ?? false);
            }
            console.log(`✅ added ${attr.key}`);
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            if (e.code === 409) console.log(`⚡ ${attr.key} exists`);
            else console.log(`❌ ${attr.key}: ${e.message}`);
        }
    }
}

fixWeaknessSchema();
