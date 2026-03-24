/**
 * Fix all 79 quotes with missing author/postTitle/source/topic.
 * 
 * Strategy:
 * 1. article quotes: look up parent post by postId → get title, author, source
 * 2. generated_fact quotes: set author="Vocab AI", derive topic from text, 
 *    generate a postTitle like "Fascinating [Topic] Fact"
 */
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Topic detection from text content
const TOPIC_KEYWORDS = {
    'linguistics': ['linguistic', 'language', 'word', 'semantic', 'phonetic', 'syntax', 'grammar', 'dialect'],
    'psychology': ['psychology', 'cognitive', 'brain', 'mental', 'emotion', 'behavior', 'consciousness', 'perception'],
    'science': ['atom', 'molecule', 'physics', 'chemical', 'quantum', 'electron', 'energy', 'scientific'],
    'biology': ['cell', 'dna', 'organism', 'species', 'evolution', 'gene', 'protein', 'biological'],
    'history': ['century', 'ancient', 'civilization', 'empire', 'war', 'historical', 'dynasty', 'medieval'],
    'philosophy': ['philosophy', 'philosophical', 'existential', 'moral', 'ethics', 'metaphysic', 'socrates', 'plato'],
    'space': ['space', 'star', 'planet', 'galaxy', 'universe', 'cosmic', 'solar', 'orbit', 'astronaut'],
    'technology': ['computer', 'algorithm', 'software', 'digital', 'internet', 'artificial intelligence', 'ai ', 'robot'],
    'culture': ['culture', 'cultural', 'society', 'social', 'tradition', 'art ', 'music', 'literature'],
    'economics': ['economic', 'economy', 'market', 'trade', 'financial', 'money', 'capitalism', 'gdp'],
    'mathematics': ['math', 'equation', 'theorem', 'number', 'calcul', 'geometry', 'algebra', 'statistic'],
    'medicine': ['medicine', 'medical', 'disease', 'health', 'treatment', 'patient', 'doctor', 'surgery'],
    'neuroscience': ['neuron', 'neural', 'brain', 'synapse', 'cortex', 'neuroscience', 'nervous system'],
    'ecology': ['ecology', 'ecosystem', 'environment', 'species', 'habitat', 'biodiversity', 'climate'],
    'geology': ['rock', 'mineral', 'volcanic', 'earthquake', 'geological', 'tectonic', 'fossil'],
    'oceanography': ['ocean', 'sea', 'marine', 'underwater', 'coral', 'whale', 'tide'],
    'astronomy': ['star', 'constellation', 'telescope', 'galaxy', 'nebula', 'comet', 'meteor'],
    'chemistry': ['chemical', 'reaction', 'element', 'compound', 'periodic', 'molecule', 'bond'],
};

function detectTopic(text) {
    const lower = text.toLowerCase();
    let bestTopic = 'science'; // default
    let bestScore = 0;
    
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestTopic = topic;
        }
    }
    return bestTopic;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function run() {
    // Fetch all quotes
    let allQuotes = [];
    let offset = 0;
    while (true) {
        const res = await db.listDocuments(DB_ID, 'quotes', [Query.limit(100), Query.offset(offset)]);
        allQuotes.push(...res.documents);
        if (allQuotes.length >= res.total) break;
        offset += 100;
    }
    
    // Filter to ones needing fixes
    const needsFix = allQuotes.filter(q => !q.author || q.author === 'Unknown' || !q.postTitle || q.postTitle === 'Untitled');
    console.log(`Total quotes: ${allQuotes.length}`);
    console.log(`Needing fix: ${needsFix.length}`);
    
    // Pre-fetch all posts for article lookups
    let allPosts = [];
    offset = 0;
    while (true) {
        const res = await db.listDocuments(DB_ID, 'posts', [Query.limit(100), Query.offset(offset)]);
        allPosts.push(...res.documents);
        if (allPosts.length >= res.total) break;
        offset += 100;
    }
    const postMap = {};
    for (const p of allPosts) {
        postMap[p.$id] = p;
    }
    console.log(`Posts loaded: ${allPosts.length}`);
    
    let fixed = 0;
    let failed = 0;
    
    for (const q of needsFix) {
        const update = {};
        
        if (q.sourceType === 'article' && q.postId && postMap[q.postId]) {
            // Look up from parent post
            const post = postMap[q.postId];
            if (!q.author || q.author === 'Unknown') {
                update.author = post.authorName || post.source || 'Article';
            }
            if (!q.postTitle || q.postTitle === 'Untitled') {
                update.postTitle = post.title || 'Article';
            }
            if (!q.source) {
                update.source = post.source || 'Article';
            }
            if (!q.topic) {
                update.topic = post.importTopic || detectTopic(q.text || '');
            }
        } else if (q.sourceType === 'generated_fact' || q.postId?.startsWith('prebuilt_')) {
            // Generated facts — derive metadata
            const topic = detectTopic(q.text || '');
            if (!q.author || q.author === 'Unknown') {
                update.author = 'Vocab AI';
            }
            if (!q.postTitle || q.postTitle === 'Untitled') {
                update.postTitle = `Fascinating ${capitalize(topic)} Fact`;
            }
            if (!q.source) {
                update.source = 'Fact Generator';
            }
            if (!q.topic) {
                update.topic = topic;
            }
        } else if (q.sourceType === 'article') {
            // Article but post not found — use text-based detection
            const topic = detectTopic(q.text || '');
            if (!q.author || q.author === 'Unknown') update.author = 'Article';
            if (!q.postTitle || q.postTitle === 'Untitled') update.postTitle = `${capitalize(topic)} Insight`;
            if (!q.source) update.source = 'Article';
            if (!q.topic) update.topic = topic;
        } else {
            // Fallback
            const topic = detectTopic(q.text || '');
            if (!q.author || q.author === 'Unknown') update.author = 'Vocab AI';
            if (!q.postTitle || q.postTitle === 'Untitled') update.postTitle = `${capitalize(topic)} Fact`;
            if (!q.source) update.source = 'Unknown Source';
            if (!q.topic) update.topic = topic;
        }
        
        if (Object.keys(update).length > 0) {
            try {
                await db.updateDocument(DB_ID, 'quotes', q.$id, update);
                console.log(`✅ Fixed ${q.$id}: ${JSON.stringify(update)}`);
                fixed++;
                await wait(200);
            } catch (e) {
                console.log(`❌ Failed ${q.$id}: ${e.message}`);
                failed++;
            }
        }
    }
    
    console.log(`\n=== Done: ${fixed} fixed, ${failed} failed ===`);
}

run().catch(console.error);
