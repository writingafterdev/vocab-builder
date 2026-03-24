const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function check() {
    // Check if coverImage attribute exists
    try {
        const attrs = await db.listAttributes(DB_ID, 'posts');
        const attrKeys = attrs.attributes.map(a => a.key);
        console.log('coverImage attribute exists:', attrKeys.includes('coverImage'));
        console.log('authorName attribute exists:', attrKeys.includes('authorName'));
        console.log('caption attribute exists:', attrKeys.includes('caption'));
        console.log('\nTotal attributes:', attrKeys.length);
        console.log('All keys:', attrKeys.join(', '));
        
        // Calculate total row size (rough)
        let totalSize = 0;
        for (const attr of attrs.attributes) {
            if (attr.size) totalSize += attr.size * 4; // UTF-8 factor
            else totalSize += 8; // int/float/bool  
        }
        console.log(`\nEstimated row size: ${(totalSize / 1024).toFixed(0)} KB (limit ~65 KB)`);
    } catch(e) {
        console.error(e.message);
    }
    
    // Check a few posts for any coverImage-like data
    const posts = await db.listDocuments(DB_ID, 'posts', [Query.limit(5)]);
    console.log('\n=== Checking 5 posts for image data ===');
    for (const p of posts.documents) {
        console.log(`\nPost: "${(p.title || '').substring(0, 50)}..."`);
        console.log(`  coverImage: ${p.coverImage || 'NOT SET'}`);
        console.log(`  authorName: ${p.authorName || 'NOT SET'}`);
        console.log(`  caption: ${p.caption || 'NOT SET'}`);
    }
}
check();
