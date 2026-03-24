const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function check() {
    let allPosts = [];
    let offset = 0;
    while (true) {
        const res = await db.listDocuments(DB_ID, 'posts', [Query.limit(100), Query.offset(offset)]);
        allPosts.push(...res.documents);
        if (allPosts.length >= res.total) break;
        offset += 100;
    }
    
    console.log('Total posts:', allPosts.length);
    
    // Check which fields are null
    const nullTitle = allPosts.filter(p => !p.title);
    const nullContent = allPosts.filter(p => !p.content);
    const nullAuthor = allPosts.filter(p => !p.authorName);
    const nullSource = allPosts.filter(p => !p.source);
    const nullCover = allPosts.filter(p => !p.coverImage);
    
    console.log('Null title:', nullTitle.length);
    console.log('Null content:', nullContent.length);
    console.log('Null authorName:', nullAuthor.length);
    console.log('Null source:', nullSource.length);
    console.log('Null coverImage:', nullCover.length);
    
    // Show all fields for a sample post
    console.log('\n--- Sample post (first one) ---');
    const sample = allPosts[0];
    for (const [key, val] of Object.entries(sample)) {
        if (key.startsWith('$')) continue;
        const display = typeof val === 'string' ? val.substring(0, 80) : val;
        console.log(`  ${key}: ${display}`);
    }
    
    // Check which fields still have data
    console.log('\n--- Fields with data across all posts ---');
    const fieldStats = {};
    for (const p of allPosts) {
        for (const [key, val] of Object.entries(p)) {
            if (key.startsWith('$')) continue;
            if (!fieldStats[key]) fieldStats[key] = { total: 0, hasData: 0 };
            fieldStats[key].total++;
            if (val !== null && val !== undefined && val !== '') fieldStats[key].hasData++;
        }
    }
    for (const [key, stats] of Object.entries(fieldStats)) {
        console.log(`  ${key}: ${stats.hasData}/${stats.total} have data`);
    }
    
    // Check if we have originalUrl to re-import
    const withUrl = allPosts.filter(p => p.originalUrl);
    console.log('\nPosts with originalUrl:', withUrl.length);
    if (withUrl.length > 0) {
        console.log('Sample URLs:');
        for (const p of withUrl.slice(0, 3)) {
            console.log(`  ${p.$id}: ${p.originalUrl}`);
        }
    }
}

check().catch(console.error);
