const { Client, Databases, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

// Every collection referenced by any API route or db module in the codebase
const COLLECTIONS = [
    'users',
    'favorite_quotes',
    'quote_feed_state',
    'userReadingLists',
    'posts',
    'quotes',
    'savedPhrases',
    'topics',
    'collections',
    'comments',
    'scenarios',
    'tokenUsage',
    'batchJobs',
    'generatedQuotes',
    'generatedSessions',
    'feedQuizzes',
    'preGeneratedExercises',
    'importSources',
    'phraseDictionary',
    'globalPhraseData',
    'audioCache',
    'skillProgress',
    'speakingProgress',
    'userProficiency',
    'userWeaknesses',
    'xpTransactions',
    'completedSessions',
    'communityAttempts',
    'savedArticles',
    'commentLikes',
    'reposts',
    'readingSessions',
];

async function createCollections() {
    console.log(`Creating ${COLLECTIONS.length} collections in database "${DB_ID}"...\n`);

    // Ensure the database exists first
    try {
        await databases.get(DB_ID);
        console.log(`📦 Database "${DB_ID}" exists.\n`);
    } catch (e) {
        if (e.code === 404) {
            console.log(`📦 Database "${DB_ID}" not found, creating...`);
            await databases.create(DB_ID, DB_ID);
            console.log(`✅ Database "${DB_ID}" created.\n`);
        } else {
            console.error(`❌ Failed to check database:`, e.message);
            return;
        }
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const colId of COLLECTIONS) {
        try {
            await databases.createCollection(
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
            console.log(`✅ Created: ${colId}`);
            created++;
        } catch (e) {
            if (e.code === 409) {
                console.log(`⚡ Already exists: ${colId}`);
                skipped++;
            } else {
                console.error(`❌ Failed: ${colId} — ${e.message}`);
                failed++;
            }
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Created: ${created}`);
    console.log(`Already existed: ${skipped}`);
    console.log(`Failed: ${failed}`);
    console.log(`\nDone!`);
}

createCollections();
