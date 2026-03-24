/**
 * Create all 20 missing collections that are blocking features.
 */
const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const MISSING = [
    'userProgress',
    'commentLikes',
    'reposts',
    'savedArticles',
    'readingSessions',
    'dailyUserProgress',
    'practiceSessionArticles',
    'practiceSessions',
    'exerciseHistory',
    'userSessions',
    'activeSessions',
    'user_settings',
    'phrasesCollections',
    'xpLedger',
    'phraseCategories',
    'user_journeys',
    'admin_rss_sources',
    'admin_reddit_sources',
    'preGeneratedQuizzes',
    'readingGoals',
];

async function run() {
    let created = 0;
    let failed = 0;
    
    for (const colId of MISSING) {
        try {
            await db.createCollection(DB_ID, colId, colId, [
                // Open permissions for server-side SDK usage
                require('node-appwrite').Permission.read(require('node-appwrite').Role.any()),
                require('node-appwrite').Permission.write(require('node-appwrite').Role.any()),
                require('node-appwrite').Permission.create(require('node-appwrite').Role.any()),
                require('node-appwrite').Permission.update(require('node-appwrite').Role.any()),
                require('node-appwrite').Permission.delete(require('node-appwrite').Role.any()),
            ]);
            console.log(`✅ Created: ${colId}`);
            created++;
            await wait(500);
        } catch (e) {
            if (e.code === 409) {
                console.log(`⚡ Already exists: ${colId}`);
            } else {
                console.log(`❌ Failed: ${colId} — ${e.message}`);
                failed++;
            }
        }
    }
    
    console.log(`\n=== Done: ${created} created, ${failed} failed ===`);
    
    // Verify final count
    const colList = await db.listCollections(DB_ID);
    console.log(`Total collections now: ${colList.collections.length}`);
}

run().catch(console.error);
