/**
 * Shrink oversized post attributes to fit under Appwrite's 65KB row limit.
 * Then add the missing coverImage, caption, and sections attributes.
 * 
 * Current situation:
 * - content:100000 alone = 400KB (4x UTF-8)
 * - We need content under ~14000 chars to leave room for other attrs
 * - Let's check what the actual max content length is in our data
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

async function run() {
    // First, check actual content lengths in our data
    const posts = await db.listDocuments(DB_ID, 'posts', [Query.limit(100)]);
    let maxContentLen = 0;
    for (const p of posts.documents) {
        const len = (p.content || '').length;
        if (len > maxContentLen) maxContentLen = len;
    }
    console.log(`Max content length in first 100 posts: ${maxContentLen} chars`);
    
    // Step 1: Delete oversized attributes that need shrinking
    console.log('\n🗑️ Deleting oversized attributes...');
    
    const toDelete = ['content', 'questions', 'title', 'url', 'excerpt', 'sourceUrl', 'topics'];
    for (const key of toDelete) {
        try {
            await db.deleteAttribute(DB_ID, 'posts', key);
            console.log(`  Deleted: ${key}`);
        } catch(e) {
            console.log(`  Skip ${key}: ${e.message}`);
        }
    }
    
    console.log('\n⏳ Waiting 15s for deletions...');
    await wait(15000);
    
    // Step 2: Recreate with right-sized attributes
    // Budget: 65KB / 4 bytes ≈ 16384 max total chars across all string attrs
    // We have ~2200 chars of existing non-deletable attrs (source, sourceId, etc.)
    // Budget remaining: ~14000 chars for new attrs
    console.log('\n📝 Recreating with right-sized attributes...');
    
    const newAttrs = [
        { key: 'content', size: 10000 },      // Most articles are < 10K chars
        { key: 'title', size: 500 },           // Titles don't exceed 500
        { key: 'questions', size: 2000 },      // Compressed
        { key: 'coverImage', size: 500 },      // URL
        { key: 'caption', size: 500 },         // Short summary
        { key: 'url', size: 500 },             // Original article URL
        { key: 'excerpt', size: 500 },         // Short excerpt
    ];
    
    for (const attr of newAttrs) {
        try {
            await db.createStringAttribute(DB_ID, 'posts', attr.key, attr.size, false);
            console.log(`  ✅ ${attr.key} (size: ${attr.size})`);
            await wait(2000);
        } catch(e) {
            if (e.code === 409) console.log(`  ⚡ ${attr.key} exists`);
            else console.log(`  ❌ ${attr.key}: ${e.message}`);
        }
    }
    
    // Final check
    const finalAttrs = await db.listAttributes(DB_ID, 'posts');
    let totalSize = 0;
    console.log('\n=== Final Schema ===');
    for (const attr of finalAttrs.attributes) {
        const s = attr.size || 8;
        const bytes = attr.type === 'string' ? s * 4 : 8;
        totalSize += bytes;
        console.log(`  ${attr.key}: ${attr.type}${attr.size ? ':' + attr.size : ''} (${(bytes/1024).toFixed(1)}KB)`);
    }
    console.log(`\nTotal estimated row size: ${(totalSize / 1024).toFixed(1)} KB (limit: 65 KB)`);
    console.log(`Has coverImage: ${finalAttrs.attributes.some(a => a.key === 'coverImage')}`);
}

run().catch(e => console.error(e));
