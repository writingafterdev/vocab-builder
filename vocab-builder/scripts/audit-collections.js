/**
 * Comprehensive audit: list all Appwrite collections and compare with
 * all collection names referenced in the codebase.
 */
const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function run() {
    // Get all existing collections
    const colList = await db.listCollections(DB_ID);
    const existing = new Set(colList.collections.map(c => c.$id));
    
    console.log(`=== ${existing.size} Existing Collections ===`);
    for (const c of [...existing].sort()) {
        console.log(`  ✅ ${c}`);
    }
    
    // All collection names used in the codebase (manually extracted from grep)
    const codeCollections = [
        'posts', 'quotes', 'quote_feed_state', 'savedPhrases',
        'users', 'userProgress', 'userReadingLists', 'favorite_quotes',
        'generatedQuotes', 'topics', 'collections', 'comments',
        'commentLikes', 'reposts', 'savedArticles', 'readingSessions',
        'dailyUserProgress', 'practiceSessionArticles', 'practiceSessions',
        'exerciseHistory', 'tokenUsage', 'userSessions',
        'batchJobs', 'activeSessions', 'user_settings',
        'phrasesCollections', 'xpLedger', 'phraseCategories',
        'user_journeys', 'admin_rss_sources', 'admin_reddit_sources',
        'preGeneratedQuizzes', 'readingGoals',
    ];
    
    console.log(`\n=== Missing Collections (needed by code) ===`);
    const missing = codeCollections.filter(c => !existing.has(c));
    for (const c of missing) {
        console.log(`  ❌ MISSING: ${c}`);
    }
    
    if (missing.length === 0) {
        console.log('  All collections exist!');
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Existing: ${existing.size}`);
    console.log(`Code needs: ${codeCollections.length}`);
    console.log(`Missing: ${missing.length}`);
    
    // Check key feature collections
    console.log('\n=== Feature Health Check ===');
    const features = {
        'Daily Facts': ['quotes', 'quote_feed_state'],
        'Quote Swiper/Doomscrolling': ['quotes', 'quote_feed_state', 'favorite_quotes'],
        'Exercises': ['savedPhrases', 'exerciseHistory', 'preGeneratedQuizzes'],
        'Practice Sessions': ['practiceSessions', 'practiceSessionArticles'],
        'SRS/Due Phrases': ['savedPhrases'],
        'User Profile': ['users', 'userProgress', 'dailyUserProgress'],
        'Reading Lists': ['userReadingLists', 'savedArticles'],
        'Comments/Social': ['comments', 'commentLikes', 'reposts'],
        'Cron Jobs': ['batchJobs', 'admin_rss_sources', 'admin_reddit_sources', 'posts'],
        'XP System': ['xpLedger', 'userProgress'],
        'TTS/Speaking': ['readingSessions'],
    };
    
    for (const [feature, collections] of Object.entries(features)) {
        const missingCols = collections.filter(c => !existing.has(c));
        if (missingCols.length > 0) {
            console.log(`  ⚠️  ${feature}: BROKEN — missing ${missingCols.join(', ')}`);
        } else {
            console.log(`  ✅ ${feature}: OK`);
        }
    }
}

run().catch(console.error);
