/**
 * Recover post data from Firebase Firestore and restore to Appwrite.
 * 
 * The original Appwrite migration script only copied a subset of fields.
 * When we deleted/recreated attributes to shrink schema, all data was wiped.
 * This script fetches the FULL post data from Firebase and updates Appwrite.
 */
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function fromFirestoreValue(value) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) {
        return (value.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ('mapValue' in value) {
        const result = {};
        for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
            result[k] = fromFirestoreValue(v);
        }
        return result;
    }
    return null;
}

async function getAllFirebasePosts() {
    let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts?pageSize=300&key=${FIREBASE_API_KEY}`;
    let allDocs = [];
    let pageToken = '';
    
    do {
        const currentUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
        const res = await fetch(currentUrl);
        if (!res.ok) throw new Error(`Firebase fetch failed: ${await res.text()}`);
        const data = await res.json();
        
        if (data.documents) {
            for (const doc of data.documents) {
                const id = doc.name.split('/').pop();
                const payload = {};
                for (const [k, v] of Object.entries(doc.fields || {})) {
                    payload[k] = fromFirestoreValue(v);
                }
                allDocs.push({ id, ...payload });
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    
    return allDocs;
}

async function run() {
    console.log('Fetching posts from Firebase...');
    const firebasePosts = await getAllFirebasePosts();
    console.log(`Found ${firebasePosts.length} posts in Firebase`);
    
    // Get all Appwrite post IDs
    let appwritePosts = [];
    let offset = 0;
    while (true) {
        const res = await db.listDocuments(DB_ID, 'posts', [Query.limit(100), Query.offset(offset)]);
        appwritePosts.push(...res.documents);
        if (appwritePosts.length >= res.total) break;
        offset += 100;
    }
    const appwriteIds = new Set(appwritePosts.map(p => p.$id));
    console.log(`Found ${appwritePosts.length} posts in Appwrite`);
    
    // Fields we can set in Appwrite (must match the schema attributes)
    const VALID_FIELDS = [
        'title', 'content', 'sourceId', 'source', 'processingStatus', 
        'batchId', 'createdAt', 'language', 'slug', 'topic', 'subtopic',
        'author', 'status', 'commentCount', 'repostCount', 'likeCount', 
        'viewCount', 'updatedAt', 'publishedAt', 'authorName', 'questions',
        'coverImage', 'caption'
    ];
    
    let updated = 0;
    let created = 0;
    let failed = 0;
    
    for (const post of firebasePosts) {
        // Normalize the ID (same logic as original migration)
        let id = post.id;
        id = id.replace(/[^a-zA-Z0-9.\-_]/g, '');
        if (id.length > 36) id = id.slice(-36);
        if (/^[^a-zA-Z0-9]/.test(id)) id = 'i' + id.slice(1);
        
        // Build the update payload
        const update = {};
        for (const field of VALID_FIELDS) {
            if (post[field] !== undefined && post[field] !== null) {
                let val = post[field];
                // Stringify objects/arrays for Appwrite string attributes
                if (typeof val === 'object' && !(val instanceof Date)) {
                    val = JSON.stringify(val);
                }
                // Truncate content to 10000 chars (Appwrite attribute limit)
                if (field === 'content' && typeof val === 'string' && val.length > 10000) {
                    val = val.substring(0, 10000);
                }
                // Truncate title/caption to reasonable sizes
                if (field === 'title' && typeof val === 'string' && val.length > 500) {
                    val = val.substring(0, 500);
                }
                if (field === 'caption' && typeof val === 'string' && val.length > 2000) {
                    val = val.substring(0, 2000);
                }
                update[field] = val;
            }
        }
        
        // Try to extract authorName from various Firebase fields
        if (!update.authorName && post.authorName) update.authorName = post.authorName;
        if (!update.authorName && post.author) {
            update.authorName = typeof post.author === 'string' 
                ? post.author 
                : post.author?.name || post.author?.username || '';
        }
        
        // Try to get coverImage
        if (!update.coverImage && post.coverImage) update.coverImage = post.coverImage;
        if (!update.coverImage && post.imageUrl) update.coverImage = post.imageUrl;
        if (!update.coverImage && post.thumbnail) update.coverImage = post.thumbnail;
        
        if (Object.keys(update).length === 0) continue;
        
        try {
            if (appwriteIds.has(id)) {
                await db.updateDocument(DB_ID, 'posts', id, update);
                updated++;
            } else {
                await db.createDocument(DB_ID, 'posts', id, update);
                created++;
            }
            
            if ((updated + created) % 10 === 0) {
                console.log(`Progress: ${updated} updated, ${created} created...`);
            }
            await wait(150);
        } catch (e) {
            console.error(`❌ Failed ${id}: ${e.message.substring(0, 100)}`);
            failed++;
        }
    }
    
    console.log(`\n=== Done ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Created: ${created}`);
    console.log(`Failed: ${failed}`);
    
    // Verify
    const sample = await db.listDocuments(DB_ID, 'posts', [Query.limit(3)]);
    for (const p of sample.documents) {
        console.log(`\nPost ${p.$id}:`);
        console.log(`  title: ${(p.title || '').substring(0, 60)}`);
        console.log(`  content: ${(p.content || '').substring(0, 60)}`);
        console.log(`  authorName: ${p.authorName}`);
        console.log(`  source: ${p.source}`);
    }
}

run().catch(console.error);
