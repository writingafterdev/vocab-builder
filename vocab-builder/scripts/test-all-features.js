/**
 * Comprehensive Feature Test Suite for Appwrite Migration
 * 
 * Tests:
 * 1. Database Layer — CRUD operations on each collection
 * 2. Data Integrity — Posts, quotes, savedPhrases have actual data
 * 3. Feed Algorithm — Quote feed returns results
 * 4. Collection Health — All 48 collections are accessible
 * 5. API Routes — Health check on key endpoints (requires dev server)
 */
const { Client, Databases, Query, ID } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

function pass(name, detail) {
    passed++;
    results.push({ status: '✅', name, detail });
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail) {
    failed++;
    results.push({ status: '❌', name, detail });
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
}
function warn(name, detail) {
    warnings++;
    results.push({ status: '⚠️', name, detail });
    console.log(`  ⚠️  ${name}${detail ? ' — ' + detail : ''}`);
}

// ──────────────────────────────────────────────────────────
// 1. DATABASE LAYER — Basic CRUD
// ──────────────────────────────────────────────────────────
async function testDatabaseCRUD() {
    console.log('\n═══ 1. Database Layer (CRUD) ═══');
    
    const testId = 'test_' + Date.now();
    
    // CREATE
    try {
        await db.createDocument(DB_ID, 'userProgress', testId, {
            userId: 'test_user',
            xp: 0,
            level: 1,
        });
        pass('CREATE document');
    } catch (e) {
        fail('CREATE document', e.message);
        return; // Can't continue without create
    }
    
    // READ
    try {
        const doc = await db.getDocument(DB_ID, 'userProgress', testId);
        if (doc.userId === 'test_user') {
            pass('READ document', 'data matches');
        } else {
            fail('READ document', 'data mismatch');
        }
    } catch (e) {
        fail('READ document', e.message);
    }
    
    // UPDATE
    try {
        await db.updateDocument(DB_ID, 'userProgress', testId, { xp: 100 });
        const updated = await db.getDocument(DB_ID, 'userProgress', testId);
        if (updated.xp === 100) {
            pass('UPDATE document', 'xp updated to 100');
        } else {
            fail('UPDATE document', `expected xp=100, got ${updated.xp}`);
        }
    } catch (e) {
        fail('UPDATE document', e.message);
    }
    
    // QUERY
    try {
        const res = await db.listDocuments(DB_ID, 'userProgress', [
            Query.equal('userId', 'test_user'),
            Query.limit(5)
        ]);
        if (res.documents.length > 0) {
            pass('QUERY documents', `found ${res.documents.length} results`);
        } else {
            fail('QUERY documents', 'no results returned');
        }
    } catch (e) {
        fail('QUERY documents', e.message);
    }
    
    // DELETE
    try {
        await db.deleteDocument(DB_ID, 'userProgress', testId);
        pass('DELETE document');
    } catch (e) {
        fail('DELETE document', e.message);
    }
}

// ──────────────────────────────────────────────────────────
// 2. DATA INTEGRITY — Core collections have actual data
// ──────────────────────────────────────────────────────────
async function testDataIntegrity() {
    console.log('\n═══ 2. Data Integrity ═══');
    
    // Posts
    try {
        const res = await db.listDocuments(DB_ID, 'posts', [Query.limit(5)]);
        const total = res.total;
        const withTitle = res.documents.filter(d => d.title && d.title !== 'null');
        const withContent = res.documents.filter(d => d.content && d.content.length > 10);
        
        if (total > 0) pass('Posts collection', `${total} documents`);
        else fail('Posts collection', 'EMPTY');
        
        if (withTitle.length === res.documents.length) pass('Posts have titles', `sample: "${withTitle[0]?.title?.substring(0, 50)}"`);
        else fail('Posts missing titles', `${res.documents.length - withTitle.length}/${res.documents.length} missing`);
        
        if (withContent.length === res.documents.length) pass('Posts have content', `avg length: ${Math.round(withContent.reduce((a,d) => a + d.content.length, 0) / withContent.length)} chars`);
        else fail('Posts missing content', `${res.documents.length - withContent.length}/${res.documents.length} missing`);
    } catch (e) {
        fail('Posts collection', e.message);
    }
    
    // Quotes
    try {
        const res = await db.listDocuments(DB_ID, 'quotes', [Query.limit(10)]);
        const total = res.total;
        const withAuthor = res.documents.filter(d => d.author && d.author !== 'Unknown' && d.author !== 'null');
        const withTitle = res.documents.filter(d => d.postTitle && d.postTitle !== 'Untitled' && d.postTitle !== 'null');
        const withTopic = res.documents.filter(d => d.topic && d.topic !== 'null');
        
        if (total > 0) pass('Quotes collection', `${total} documents`);
        else fail('Quotes collection', 'EMPTY');
        
        if (withAuthor.length === res.documents.length) pass('Quotes have authors', `e.g. "${withAuthor[0]?.author}"`);
        else warn('Quotes missing authors', `${res.documents.length - withAuthor.length}/${res.documents.length} missing`);
        
        if (withTitle.length === res.documents.length) pass('Quotes have postTitle');
        else warn('Quotes missing postTitle', `${res.documents.length - withTitle.length}/${res.documents.length} missing`);
        
        if (withTopic.length === res.documents.length) pass('Quotes have topic', `e.g. "${withTopic[0]?.topic}"`);
        else warn('Quotes missing topic', `${res.documents.length - withTopic.length}/${res.documents.length} missing`);
    } catch (e) {
        fail('Quotes collection', e.message);
    }
    
    // SavedPhrases
    try {
        const res = await db.listDocuments(DB_ID, 'savedPhrases', [Query.limit(5)]);
        if (res.total > 0) {
            pass('SavedPhrases collection', `${res.total} documents`);
            const sample = res.documents[0];
            if (sample.phrase) pass('SavedPhrases have phrase data', `e.g. "${sample.phrase}"`);
            else warn('SavedPhrases missing phrase field');
        } else {
            warn('SavedPhrases collection', 'EMPTY (no saved phrases yet, normal for new users)');
        }
    } catch (e) {
        fail('SavedPhrases collection', e.message);
    }
    
    // Users
    try {
        const res = await db.listDocuments(DB_ID, 'users', [Query.limit(5)]);
        if (res.total > 0) {
            pass('Users collection', `${res.total} documents`);
        } else {
            warn('Users collection', 'EMPTY');
        }
    } catch (e) {
        fail('Users collection', e.message);
    }
}

// ──────────────────────────────────────────────────────────
// 3. COLLECTION ACCESS — All 48 collections are readable
// ──────────────────────────────────────────────────────────
async function testCollectionAccess() {
    console.log('\n═══ 3. Collection Access (all 48) ═══');
    
    const colList = await db.listCollections(DB_ID, [Query.limit(100)]);
    const collections = colList.collections.map(c => c.$id).sort();
    
    let accessible = 0;
    let inaccessible = 0;
    
    for (const colId of collections) {
        try {
            const res = await db.listDocuments(DB_ID, colId, [Query.limit(1)]);
            accessible++;
            // Only report ones with data for brevity
            if (res.total > 0) {
                pass(`${colId}`, `${res.total} docs`);
            }
        } catch (e) {
            inaccessible++;
            fail(`${colId}`, e.message.substring(0, 60));
        }
    }
    
    if (inaccessible === 0) {
        pass(`All ${accessible} collections accessible`);
    } else {
        fail(`${inaccessible} collections inaccessible`);
    }
    
    // Report empty collections
    for (const colId of collections) {
        try {
            const res = await db.listDocuments(DB_ID, colId, [Query.limit(1)]);
            if (res.total === 0) {
                // Empty is OK for most collections — they get populated when users interact
            }
        } catch(e) {}
    }
}

// ──────────────────────────────────────────────────────────
// 4. SERIALIZATION — JSON objects survive round-trip
// ──────────────────────────────────────────────────────────
async function testSerialization() {
    console.log('\n═══ 4. Serialization Round-Trip ═══');
    
    const testId = 'ser_test_' + Date.now();
    const testData = {
        userId: 'test_ser',
        topicScores: JSON.stringify({ technology: 5, science: 3 }),
        viewedQuoteIds: JSON.stringify(['q1', 'q2', 'q3']),
        hasCompletedOnboarding: true,
        updatedAt: new Date().toISOString(),
    };
    
    try {
        await db.createDocument(DB_ID, 'quote_feed_state', testId, testData);
        const doc = await db.getDocument(DB_ID, 'quote_feed_state', testId);
        
        // Check JSON string survived
        const scores = JSON.parse(doc.topicScores);
        if (scores.technology === 5 && scores.science === 3) {
            pass('JSON object serialization', 'topicScores round-tripped correctly');
        } else {
            fail('JSON object serialization', 'data mismatch after parse');
        }
        
        const ids = JSON.parse(doc.viewedQuoteIds);
        if (Array.isArray(ids) && ids.length === 3) {
            pass('JSON array serialization', 'viewedQuoteIds round-tripped correctly');
        } else {
            fail('JSON array serialization', 'array mismatch');
        }
        
        if (doc.hasCompletedOnboarding === true) {
            pass('Boolean serialization');
        } else {
            fail('Boolean serialization');
        }
        
        // Cleanup
        await db.deleteDocument(DB_ID, 'quote_feed_state', testId);
        pass('Cleanup test document');
    } catch (e) {
        fail('Serialization test', e.message);
        try { await db.deleteDocument(DB_ID, 'quote_feed_state', testId); } catch {}
    }
}

// ──────────────────────────────────────────────────────────
// 5. FEATURE-SPECIFIC QUERIES — Real business logic
// ──────────────────────────────────────────────────────────
async function testFeatureQueries() {
    console.log('\n═══ 5. Feature-Specific Queries ═══');
    
    // Quote Feed — query by topic
    try {
        const res = await db.listDocuments(DB_ID, 'quotes', [
            Query.equal('sourceType', 'generated_fact'),
            Query.limit(5),
        ]);
        if (res.total > 0) {
            pass('Quote feed query (by sourceType)', `${res.total} generated facts`);
        } else {
            warn('Quote feed query', 'No generated facts found');
        }
    } catch (e) {
        // May fail if sourceType is not indexed — that's expected for non-indexed fields
        if (e.message.includes('index')) {
            warn('Quote feed query', 'Needs index on sourceType (non-critical)');
        } else {
            fail('Quote feed query', e.message);
        }
    }
    
    // Posts — query by source
    try {
        const res = await db.listDocuments(DB_ID, 'posts', [
            Query.equal('source', 'r/psychology'),
            Query.limit(3),
        ]);
        if (res.total > 0) {
            pass('Posts query (by source)', `${res.total} r/psychology posts`);
        } else {
            warn('Posts query', 'No r/psychology posts found');
        }
    } catch (e) {
        if (e.message.includes('index')) {
            warn('Posts source query', 'Needs index (non-critical)');
        } else {
            fail('Posts source query', e.message);
        }
    }
    
    // Posts — check content quality
    try {
        const res = await db.listDocuments(DB_ID, 'posts', [Query.limit(20)]);
        const withBoth = res.documents.filter(d => d.title && d.content && d.content.length > 50);
        const pct = Math.round((withBoth.length / res.documents.length) * 100);
        if (pct >= 90) {
            pass('Posts data quality', `${pct}% have title+content (${withBoth.length}/${res.documents.length})`);
        } else if (pct >= 50) {
            warn('Posts data quality', `${pct}% have title+content`);
        } else {
            fail('Posts data quality', `Only ${pct}% have title+content`);
        }
    } catch (e) {
        fail('Posts data quality check', e.message);
    }
    
    // Favorite quotes collection — read test
    try {
        const res = await db.listDocuments(DB_ID, 'favorite_quotes', [Query.limit(1)]);
        pass('Favorite quotes collection', `${res.total} docs (accessible)`);
    } catch (e) {
        fail('Favorite quotes collection', e.message);
    }
    
    // Token usage tracking
    try {
        const res = await db.listDocuments(DB_ID, 'tokenUsage', [Query.limit(1)]);
        pass('Token usage collection', `${res.total} docs`);
    } catch (e) {
        fail('Token usage collection', e.message);
    }
    
    // Batch jobs (cron)
    try {
        const res = await db.listDocuments(DB_ID, 'batchJobs', [Query.limit(3)]);
        if (res.total > 0) {
            pass('Batch jobs collection', `${res.total} jobs tracked`);
        } else {
            warn('Batch jobs collection', 'No jobs yet (normal if crons haven\'t run)');
        }
    } catch (e) {
        fail('Batch jobs collection', e.message);
    }
}

// ──────────────────────────────────────────────────────────
// 6. API ROUTE HEALTH (requires dev server on :3000)
// ──────────────────────────────────────────────────────────
async function testAPIRoutes() {
    console.log('\n═══ 6. API Route Health ═══');
    
    const BASE = 'http://localhost:3000';
    
    // Check if dev server is running
    try {
        const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
        pass('Dev server reachable');
    } catch {
        warn('Dev server not running', 'Skipping API tests (start with npm run dev)');
        return;
    }
    
    const routes = [
        { path: '/api/quotes/get-mixed-quotes', method: 'GET', name: 'Quote Feed API' },
        { path: '/api/quotes/topic-picker', method: 'GET', name: 'Topic Picker API' },
        { path: '/api/cron/generate-facts', method: 'GET', name: 'Fact Generator API' },
        { path: '/api/exercise/feed-quizzes', method: 'GET', name: 'Feed Quizzes API' },
    ];
    
    for (const route of routes) {
        try {
            const res = await fetch(`${BASE}${route.path}`, {
                method: route.method,
                headers: { 'x-user-id': 'test_health_check' },
                signal: AbortSignal.timeout(10000),
            });
            
            if (res.status < 500) {
                pass(`${route.name}`, `HTTP ${res.status}`);
            } else {
                const body = await res.text().catch(() => '');
                fail(`${route.name}`, `HTTP ${res.status}: ${body.substring(0, 80)}`);
            }
        } catch (e) {
            fail(`${route.name}`, e.message.substring(0, 60));
        }
    }
}

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Appwrite Migration — Feature Test Suite        ║');
    console.log('╚══════════════════════════════════════════════════╝');
    
    await testDatabaseCRUD();
    await testDataIntegrity();
    await testCollectionAccess();
    await testSerialization();
    await testFeatureQueries();
    await testAPIRoutes();
    
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║   RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
    console.log('╚══════════════════════════════════════════════════╝');
    
    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        for (const r of results.filter(r => r.status === '❌')) {
            console.log(`   ${r.name}: ${r.detail}`);
        }
    }
    if (warnings > 0) {
        console.log('\n⚠️  WARNINGS:');
        for (const r of results.filter(r => r.status === '⚠️')) {
            console.log(`   ${r.name}: ${r.detail}`);
        }
    }
    
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Test suite crashed:', e); process.exit(2); });
