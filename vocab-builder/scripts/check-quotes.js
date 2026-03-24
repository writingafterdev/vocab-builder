const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function check() {
    // Get all quotes
    let allQuotes = [];
    let offset = 0;
    while (true) {
        const res = await db.listDocuments(DB_ID, 'quotes', [Query.limit(100), Query.offset(offset)]);
        allQuotes.push(...res.documents);
        if (allQuotes.length >= res.total) break;
        offset += 100;
    }
    
    console.log('Total quotes:', allQuotes.length);
    
    // Analyze metadata quality
    const unknownAuthor = allQuotes.filter(d => !d.author || d.author === 'Unknown');
    const untitled = allQuotes.filter(d => !d.postTitle || d.postTitle === 'Untitled');
    const hasAuthorField = allQuotes.filter(d => d.author && d.author !== 'Unknown');
    
    console.log('\nWith valid author:', hasAuthorField.length);
    console.log('Unknown/missing author:', unknownAuthor.length);
    console.log('Untitled/missing postTitle:', untitled.length);
    
    // Show first 5 unknowns
    console.log('\n--- Sample Unknown Quotes ---');
    for (const q of unknownAuthor.slice(0, 5)) {
        console.log({
            id: q.$id,
            author: q.author,
            postTitle: q.postTitle,
            postId: q.postId?.substring(0, 50),
            source: q.source,
            sourceType: q.sourceType,
            topic: q.topic,
            text: q.text?.substring(0, 80),
        });
    }
    
    // Show first 5 known (for comparison)
    console.log('\n--- Sample Known Quotes ---');
    for (const q of hasAuthorField.slice(0, 3)) {
        console.log({
            id: q.$id,
            author: q.author,
            postTitle: q.postTitle,
            source: q.source,
            sourceType: q.sourceType,
        });
    }
    
    // Check sourceTypes
    const types = {};
    for (const q of allQuotes) {
        const t = q.sourceType || 'none';
        types[t] = (types[t] || 0) + 1;
    }
    console.log('\nSource type breakdown:', types);
}
check().catch(console.error);
