/**
 * Setup ALL Appwrite collection attributes
 * 
 * This script creates every attribute needed by every collection in the app.
 * Run: node scripts/setup-appwrite-attributes.js
 * 
 * NOTE: Appwrite has a row-size limit (~65KB for MariaDB).
 *   - String attributes use 4x their size for UTF-8.
 *   - Keep sizes small and use JSON strings for complex nested data.
 */
const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

// Delay helper (Appwrite needs short pauses between attribute creations)
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Schema Definitions ───────────────────────────────────────────────
// Each entry: { key, type, size?, required?, default?, array? }
// type: 'string' | 'integer' | 'float' | 'boolean'
// For JSON blobs: use 'string' + moderate size

const SCHEMAS = {
    users: [
        { key: 'uid', type: 'string', size: 255, required: true },
        { key: 'email', type: 'string', size: 255 },
        { key: 'displayName', type: 'string', size: 255 },
        { key: 'username', type: 'string', size: 255 },
        { key: 'bio', type: 'string', size: 500 },
        { key: 'photoURL', type: 'string', size: 500 },
        { key: 'role', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'lastActiveAt', type: 'string', size: 100 },
        { key: 'onboardingCompleted', type: 'boolean' },
        { key: 'stats', type: 'string', size: 2000 },         // JSON blob
        { key: 'subscription', type: 'string', size: 500 },   // JSON blob
        { key: 'settings', type: 'string', size: 500 },       // JSON blob
        { key: 'preferences', type: 'string', size: 500 },    // JSON blob
    ],

    favorite_quotes: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'quoteId', type: 'string', size: 255 },
        { key: 'text', type: 'string', size: 2000 },
        { key: 'postId', type: 'string', size: 255 },
        { key: 'postTitle', type: 'string', size: 500 },
        { key: 'author', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    quote_feed_state: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'viewedQuoteIds', type: 'string', size: 10000 },   // JSON array of IDs
        { key: 'topicScores', type: 'string', size: 5000 },       // JSON object
        { key: 'hasCompletedOnboarding', type: 'boolean' },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    userReadingLists: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'name', type: 'string', size: 255 },
        { key: 'description', type: 'string', size: 1000 },
        { key: 'coverColor', type: 'string', size: 50 },
        { key: 'postIds', type: 'string', size: 5000 },     // JSON array
        { key: 'sourceId', type: 'string', size: 255 },
        { key: 'isPublic', type: 'boolean' },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    posts: [
        { key: 'title', type: 'string', size: 500 },
        { key: 'slug', type: 'string', size: 255 },
        { key: 'content', type: 'string', size: 50000 },
        { key: 'excerpt', type: 'string', size: 1000 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'subtopic', type: 'string', size: 100 },
        { key: 'source', type: 'string', size: 255 },
        { key: 'sourceUrl', type: 'string', size: 500 },
        { key: 'author', type: 'string', size: 255 },
        { key: 'status', type: 'string', size: 50 },
        { key: 'commentCount', type: 'integer' },
        { key: 'repostCount', type: 'integer' },
        { key: 'likeCount', type: 'integer' },
        { key: 'viewCount', type: 'integer' },
        { key: 'sections', type: 'string', size: 50000 },      // JSON blob
        { key: 'questions', type: 'string', size: 10000 },     // JSON blob
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
        { key: 'publishedAt', type: 'string', size: 100 },
    ],

    quotes: [
        { key: 'text', type: 'string', size: 2000 },
        { key: 'postId', type: 'string', size: 255 },
        { key: 'postTitle', type: 'string', size: 500 },
        { key: 'author', type: 'string', size: 255 },
        { key: 'source', type: 'string', size: 255 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'tags', type: 'string', size: 2000 },           // JSON array
        { key: 'highlightedPhrases', type: 'string', size: 2000 }, // JSON array
        { key: 'sourceType', type: 'string', size: 50 },
        { key: 'sessionId', type: 'string', size: 255 },
        { key: 'userId', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    savedPhrases: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'phrase', type: 'string', size: 500 },
        { key: 'definition', type: 'string', size: 1000 },
        { key: 'example', type: 'string', size: 1000 },
        { key: 'context', type: 'string', size: 1000 },
        { key: 'postId', type: 'string', size: 255 },
        { key: 'postTitle', type: 'string', size: 255 },
        { key: 'difficulty', type: 'string', size: 50 },
        { key: 'mastery', type: 'integer' },
        { key: 'reviewCount', type: 'integer' },
        { key: 'correctCount', type: 'integer' },
        { key: 'incorrectCount', type: 'integer' },
        { key: 'nextReviewAt', type: 'string', size: 100 },
        { key: 'lastReviewedAt', type: 'string', size: 100 },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'encounterCount', type: 'integer' },
        { key: 'srsInterval', type: 'integer' },
        { key: 'srsFactor', type: 'float' },
        { key: 'usageExamples', type: 'string', size: 5000 },   // JSON array
    ],

    topics: [
        { key: 'label', type: 'string', size: 255 },
        { key: 'subtopics', type: 'string', size: 5000 },       // JSON array
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    collections: [
        { key: 'name', type: 'string', size: 255 },
        { key: 'description', type: 'string', size: 1000 },
        { key: 'coverColor', type: 'string', size: 50 },
        { key: 'postIds', type: 'string', size: 5000 },         // JSON array
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    comments: [
        { key: 'postId', type: 'string', size: 255 },
        { key: 'authorId', type: 'string', size: 255 },
        { key: 'authorName', type: 'string', size: 255 },
        { key: 'authorUsername', type: 'string', size: 255 },
        { key: 'authorPhotoURL', type: 'string', size: 500 },
        { key: 'content', type: 'string', size: 5000 },
        { key: 'likeCount', type: 'integer' },
        { key: 'replyCount', type: 'integer' },
        { key: 'parentId', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    scenarios: [
        { key: 'title', type: 'string', size: 255 },
        { key: 'description', type: 'string', size: 1000 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'subtopic', type: 'string', size: 100 },
        { key: 'difficulty', type: 'string', size: 50 },
        { key: 'context', type: 'string', size: 2000 },
        { key: 'targetPhrases', type: 'string', size: 2000 },   // JSON array
        { key: 'status', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    tokenUsage: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'userEmail', type: 'string', size: 255 },
        { key: 'model', type: 'string', size: 100 },
        { key: 'inputTokens', type: 'integer' },
        { key: 'outputTokens', type: 'integer' },
        { key: 'promptTokens', type: 'integer' },
        { key: 'completionTokens', type: 'integer' },
        { key: 'totalTokens', type: 'integer' },
        { key: 'endpoint', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    batchJobs: [
        { key: 'type', type: 'string', size: 100 },
        { key: 'status', type: 'string', size: 50 },
        { key: 'externalId', type: 'string', size: 255 },
        { key: 'metadata', type: 'string', size: 5000 },        // JSON blob
        { key: 'result', type: 'string', size: 10000 },         // JSON blob
        { key: 'error', type: 'string', size: 2000 },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
        { key: 'completedAt', type: 'string', size: 100 },
    ],

    generatedQuotes: [
        { key: 'batchJobId', type: 'string', size: 255 },
        { key: 'text', type: 'string', size: 2000 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'tags', type: 'string', size: 2000 },
        { key: 'source', type: 'string', size: 255 },
        { key: 'status', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    generatedSessions: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'subtopic', type: 'string', size: 100 },
        { key: 'title', type: 'string', size: 500 },
        { key: 'content', type: 'string', size: 50000 },
        { key: 'phrases', type: 'string', size: 5000 },        // JSON array
        { key: 'questions', type: 'string', size: 10000 },     // JSON blob
        { key: 'status', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    feedQuizzes: [
        { key: 'postId', type: 'string', size: 255 },
        { key: 'quoteId', type: 'string', size: 255 },
        { key: 'question', type: 'string', size: 1000 },
        { key: 'options', type: 'string', size: 2000 },        // JSON array
        { key: 'correctIndex', type: 'integer' },
        { key: 'explanation', type: 'string', size: 1000 },
        { key: 'type', type: 'string', size: 50 },
        { key: 'difficulty', type: 'string', size: 50 },
        { key: 'targetPhrase', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    preGeneratedExercises: [
        { key: 'postId', type: 'string', size: 255 },
        { key: 'type', type: 'string', size: 50 },
        { key: 'exercises', type: 'string', size: 20000 },    // JSON blob
        { key: 'status', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    importSources: [
        { key: 'name', type: 'string', size: 255 },
        { key: 'url', type: 'string', size: 500 },
        { key: 'type', type: 'string', size: 50 },
        { key: 'topic', type: 'string', size: 100 },
        { key: 'status', type: 'string', size: 50 },
        { key: 'lastImportAt', type: 'string', size: 100 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    phraseDictionary: [
        { key: 'phraseKey', type: 'string', size: 500 },
        { key: 'phrase', type: 'string', size: 500 },
        { key: 'baseForm', type: 'string', size: 500 },
        { key: 'meaning', type: 'string', size: 2000 },
        { key: 'context', type: 'string', size: 2000 },
        { key: 'contextTranslation', type: 'string', size: 2000 },
        { key: 'pronunciation', type: 'string', size: 255 },
        { key: 'register', type: 'string', size: 500 },         // JSON (string or array)
        { key: 'nuance', type: 'string', size: 500 },           // JSON (string or array)
        { key: 'socialDistance', type: 'string', size: 500 },    // JSON array
        { key: 'topic', type: 'string', size: 500 },            // JSON (string or array)
        { key: 'subtopic', type: 'string', size: 500 },         // JSON (string or array)
        { key: 'isHighFrequency', type: 'boolean' },
        { key: 'commonUsages', type: 'string', size: 3000 },    // JSON array
        { key: 'registerVariants', type: 'string', size: 2000 },// JSON array
        { key: 'nuanceVariants', type: 'string', size: 2000 },  // JSON array
        { key: 'lookupCount', type: 'integer' },
        { key: 'saveCount', type: 'integer' },
        { key: 'generatedAt', type: 'string', size: 100 },
    ],

    globalPhraseData: [
        { key: 'phrase', type: 'string', size: 500 },
        { key: 'totalEncounters', type: 'integer' },
        { key: 'totalSaves', type: 'integer' },
        { key: 'averageMastery', type: 'float' },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    audioCache: [
        { key: 'textHash', type: 'string', size: 255 },
        { key: 'voice', type: 'string', size: 100 },
        { key: 'audioUrl', type: 'string', size: 1000 },
        { key: 'provider', type: 'string', size: 50 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    skillProgress: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'skillId', type: 'string', size: 255 },
        { key: 'level', type: 'integer' },
        { key: 'xp', type: 'integer' },
        { key: 'data', type: 'string', size: 5000 },           // JSON blob
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    speakingProgress: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'sessionCount', type: 'integer' },
        { key: 'totalScore', type: 'float' },
        { key: 'data', type: 'string', size: 5000 },           // JSON blob
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    userProficiency: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'level', type: 'string', size: 50 },
        { key: 'scores', type: 'string', size: 5000 },          // JSON blob
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    userProgress: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'xp', type: 'integer' },
        { key: 'level', type: 'integer' },
    ],

    userWeaknesses: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'weaknesses', type: 'string', size: 5000 },      // JSON blob
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    xpTransactions: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'amount', type: 'integer' },
        { key: 'type', type: 'string', size: 100 },
        { key: 'source', type: 'string', size: 255 },
        { key: 'description', type: 'string', size: 500 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    completedSessions: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'sessionId', type: 'string', size: 255 },
        { key: 'type', type: 'string', size: 50 },
        { key: 'score', type: 'float' },
        { key: 'data', type: 'string', size: 5000 },            // JSON blob
        { key: 'completedAt', type: 'string', size: 100 },
    ],

    communityAttempts: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'exerciseId', type: 'string', size: 255 },
        { key: 'answer', type: 'string', size: 2000 },
        { key: 'isCorrect', type: 'boolean' },
        { key: 'score', type: 'float' },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    savedArticles: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'postId', type: 'string', size: 255 },
        { key: 'savedAt', type: 'string', size: 100 },
    ],

    commentLikes: [
        { key: 'commentId', type: 'string', size: 255 },
        { key: 'userId', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    reposts: [
        { key: 'postId', type: 'string', size: 255 },
        { key: 'userId', type: 'string', size: 255 },
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    readingSessions: [
        { key: 'userId', type: 'string', size: 255 },
        { key: 'phraseIds', type: 'string', size: 5000 },       // JSON array
        { key: 'phrasesHash', type: 'string', size: 255 },
        { key: 'article', type: 'string', size: 50000 },        // JSON blob
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'completedAt', type: 'string', size: 100 },
        { key: 'currentQuestionIndex', type: 'integer' },
        { key: 'correctAnswers', type: 'integer' },
    ],

    lookupHistory: [
        { key: 'userId', type: 'string', size: 255, required: true },
        { key: 'phraseKey', type: 'string', size: 500 },
        { key: 'phrase', type: 'string', size: 500 },
        { key: 'meaning', type: 'string', size: 2000 },
        { key: 'context', type: 'string', size: 2000 },
        { key: 'register', type: 'string', size: 500 },
        { key: 'nuance', type: 'string', size: 500 },
        { key: 'topic', type: 'string', size: 500 },
        { key: 'subtopic', type: 'string', size: 500 },
        { key: 'lookedUpAt', type: 'string', size: 100 },
    ],

    // ─── Curated Vocabulary Decks ────────────────────────────────────────

    decks: [
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'type', type: 'string', size: 50, required: true },  // 'linguistic' | 'thematic'
        { key: 'description', type: 'string', size: 1000 },
        { key: 'icon', type: 'string', size: 50 },
        { key: 'color', type: 'string', size: 50 },
        { key: 'phraseCount', type: 'integer' },
        { key: 'status', type: 'string', size: 50 },                // 'draft' | 'active' | 'archived'
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],

    deckPhrases: [
        { key: 'deckId', type: 'string', size: 255, required: true },
        { key: 'phrase', type: 'string', size: 500, required: true },
        { key: 'meaning', type: 'string', size: 2000 },
        { key: 'meaningVi', type: 'string', size: 1000 },
        { key: 'phonetic', type: 'string', size: 255 },
        { key: 'partOfSpeech', type: 'string', size: 100 },
        { key: 'register', type: 'string', size: 500 },             // JSON
        { key: 'nuance', type: 'string', size: 500 },               // JSON
        { key: 'example', type: 'string', size: 2000 },
        { key: 'commonUsages', type: 'string', size: 3000 },        // JSON array
        { key: 'topic', type: 'string', size: 500 },                // JSON
        { key: 'subtopic', type: 'string', size: 500 },             // JSON
        { key: 'isHighFrequency', type: 'boolean' },
        { key: 'metadataStatus', type: 'string', size: 50 },        // 'pending' | 'generated' | 'failed'
        { key: 'createdAt', type: 'string', size: 100 },
    ],

    userDeckSubscriptions: [
        { key: 'userId', type: 'string', size: 255, required: true },
        { key: 'deckId', type: 'string', size: 255, required: true },
        { key: 'subscribedAt', type: 'string', size: 100 },
    ],
};

// ─── Execution ───────────────────────────────────────────────────────

async function createAttribute(collectionId, attr) {
    try {
        const required = attr.required || false;
        
        if (attr.type === 'string') {
            await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size || 255, required);
        } else if (attr.type === 'integer') {
            await databases.createIntegerAttribute(DB_ID, collectionId, attr.key, required);
        } else if (attr.type === 'float') {
            await databases.createFloatAttribute(DB_ID, collectionId, attr.key, required);
        } else if (attr.type === 'boolean') {
            await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, required);
        }
        return 'created';
    } catch (e) {
        if (e.code === 409) return 'exists';
        return `error: ${e.message}`;
    }
}

async function run() {
    const collectionIds = Object.keys(SCHEMAS);
    console.log(`\n🔧 Setting up attributes for ${collectionIds.length} collections...\n`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const colId of collectionIds) {
        const attrs = SCHEMAS[colId];
        console.log(`\n📂 ${colId} (${attrs.length} attributes)`);

        let colCreated = 0, colSkipped = 0, colFailed = 0;

        for (const attr of attrs) {
            const result = await createAttribute(colId, attr);
            if (result === 'created') {
                console.log(`   ✅ ${attr.key} (${attr.type}${attr.size ? ':' + attr.size : ''})`);
                colCreated++;
                await wait(1500); // Appwrite needs time between attribute creations
            } else if (result === 'exists') {
                console.log(`   ⚡ ${attr.key} — already exists`);
                colSkipped++;
            } else {
                console.log(`   ❌ ${attr.key} — ${result}`);
                colFailed++;
            }
        }

        totalCreated += colCreated;
        totalSkipped += colSkipped;
        totalFailed += colFailed;
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`✅ Created: ${totalCreated}`);
    console.log(`⚡ Already existed: ${totalSkipped}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`${'═'.repeat(50)}\n`);
}

run();
