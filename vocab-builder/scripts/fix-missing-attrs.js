/**
 * Fix missing attributes for posts and quotes collections
 * These fields exist in the data but were not in the original attribute setup.
 */
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function createAttr(collectionId, key, size, required = false) {
    try {
        await databases.createStringAttribute(DB_ID, collectionId, key, size, required);
        console.log(`  ✅ ${collectionId}.${key} (string:${size})`);
        await wait(1500);
    } catch (e) {
        if (e.code === 409) {
            console.log(`  ⚡ ${collectionId}.${key} — already exists`);
        } else {
            console.log(`  ❌ ${collectionId}.${key} — ${e.message}`);
        }
    }
}

async function run() {
    console.log('=== Adding missing attributes ===\n');

    // Posts collection: add missing fields  
    console.log('📂 posts:');
    await createAttr('posts', 'coverImage', 1000);     // Image URL
    await createAttr('posts', 'authorName', 255);       // Author display name
    await createAttr('posts', 'caption', 1000);         // Post caption/summary
    await createAttr('posts', 'url', 1000);             // Original URL
    await createAttr('posts', 'sourceId', 255);         // Source identifier
    await createAttr('posts', 'processingStatus', 50);  // Processing status
    await createAttr('posts', 'batchId', 255);          // Batch job ID
    await createAttr('posts', 'language', 50);           // Language code

    // Now let's also backfill quote metadata from their parent posts
    console.log('\n🔄 Backfilling quote metadata from posts...\n');
    
    const quotes = await databases.listDocuments(DB_ID, 'quotes', [
        Query.isNull('postTitle'),
        Query.limit(100)
    ]);
    
    console.log(`Found ${quotes.documents.length} quotes with missing postTitle`);
    
    let fixed = 0;
    for (const quote of quotes.documents) {
        if (!quote.postId) continue;
        
        try {
            const post = await databases.getDocument(DB_ID, 'posts', quote.postId);
            const updates = {};
            
            if (!quote.postTitle && post.title) {
                updates.postTitle = post.title;
            }
            if (!quote.author && post.source) {
                updates.author = post.source;
            }
            if (!quote.source && post.source) {
                updates.source = post.source;
            }
            
            if (Object.keys(updates).length > 0) {
                await databases.updateDocument(DB_ID, 'quotes', quote.$id, updates);
                console.log(`  ✅ Updated quote ${quote.$id.substring(0, 12)}... → postTitle: "${(updates.postTitle || '').substring(0, 40)}..."`);
                fixed++;
            }
        } catch (e) {
            console.log(`  ⚠️ Skipped quote ${quote.$id.substring(0, 12)}... — ${e.message}`);
        }
    }
    
    console.log(`\n✅ Backfilled ${fixed} quotes with metadata from their parent posts.`);
    console.log('Done!');
}

run();
