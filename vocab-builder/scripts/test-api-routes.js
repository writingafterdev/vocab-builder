/**
 * API Route Health Check — Tests all key endpoints 
 * Requires dev server running on localhost:3000
 */
require('dotenv').config({ path: '.env.local' });

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(name, detail) { passed++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
function fail(name, detail) { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
function warn(name, detail) { warnings++; console.log(`  ⚠️  ${name}${detail ? ' — ' + detail : ''}`); }

async function testRoute(name, path, opts = {}) {
    const method = opts.method || 'GET';
    const headers = { 'x-user-id': 'test_health_check', ...(opts.headers || {}) };
    const fetchOpts = { method, headers, signal: AbortSignal.timeout(15000) };
    if (opts.body) {
        fetchOpts.body = JSON.stringify(opts.body);
        headers['Content-Type'] = 'application/json';
    }
    
    try {
        const res = await fetch(`${BASE}${path}`, fetchOpts);
        const text = await res.text().catch(() => '');
        let json;
        try { json = JSON.parse(text); } catch {}
        
        if (res.status < 500) {
            pass(name, `HTTP ${res.status}${json?.error ? ' (auth: ' + json.error + ')' : ''}`);
            return { status: res.status, json };
        } else {
            fail(name, `HTTP ${res.status}: ${text.substring(0, 100)}`);
            return { status: res.status, error: text };
        }
    } catch (e) {
        fail(name, e.message.substring(0, 80));
        return { error: e.message };
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   API Route Health Check                         ║');
    console.log('╚══════════════════════════════════════════════════╝');
    
    // ─── Quote System ───
    console.log('\n═══ Quote System ═══');
    await testRoute('GET /api/quotes/get-mixed-quotes', '/api/quotes/get-mixed-quotes');
    await testRoute('GET /api/quotes/topic-picker', '/api/quotes/topic-picker');
    await testRoute('POST /api/quotes/mark-viewed', '/api/quotes/mark-viewed', {
        method: 'POST', body: { quoteIds: [] }
    });
    await testRoute('POST /api/quotes/save-topic-choices', '/api/quotes/save-topic-choices', {
        method: 'POST', body: { topics: ['technology'] }
    });
    await testRoute('POST /api/quotes/boost-topic', '/api/quotes/boost-topic', {
        method: 'POST', body: { topic: 'science', weight: 1 }
    });
    
    // ─── User System ───
    console.log('\n═══ User System ═══');
    await testRoute('GET /api/user/due-phrases', '/api/user/due-phrases');
    await testRoute('GET /api/user/saved-quote-ids', '/api/user/saved-quote-ids');
    await testRoute('GET /api/user/reading-lists', '/api/user/reading-lists');
    await testRoute('GET /api/user/topic-scores', '/api/user/topic-scores');
    await testRoute('GET /api/user/stats', '/api/user/stats');
    
    // ─── Exercise System ───
    console.log('\n═══ Exercise System ═══');
    await testRoute('GET /api/exercise/feed-quizzes', '/api/exercise/feed-quizzes');
    await testRoute('POST /api/exercise/content-quiz', '/api/exercise/content-quiz', {
        method: 'POST', body: { contentText: 'Test content', surface: 'quote_swiper' }
    });
    await testRoute('POST /api/exercise/check-answer', '/api/exercise/check-answer', {
        method: 'POST', body: { questionId: 'test', answer: 'test', phraseId: 'test' }
    });
    
    // ─── Practice System ───
    console.log('\n═══ Practice System ═══');
    await testRoute('GET /api/practice/list-sessions', '/api/practice/list-sessions');
    
    // ─── Cron Jobs ───
    console.log('\n═══ Cron Jobs ═══');
    await testRoute('GET /api/cron/generate-facts (dry)', '/api/cron/generate-facts');
    await testRoute('GET /api/cron/daily-import (dry)', '/api/cron/daily-import');
    
    // ─── Phrase Management ───
    console.log('\n═══ Phrase Management ═══');
    await testRoute('POST /api/phrase/save', '/api/phrase/save', {
        method: 'POST', body: { phrase: 'test_health', meaning: 'test' }
    });
    await testRoute('POST /api/phrase/lookup-bank', '/api/phrase/lookup-bank', {
        method: 'POST', body: { phrase: 'intricate' }
    });
    
    // ─── Posts / Articles ───
    console.log('\n═══ Posts / Articles ═══');
    await testRoute('GET /api/posts', '/api/posts');
    
    // ─── Favorites ───
    console.log('\n═══ Favorites ═══');
    await testRoute('GET /api/user/favorite-quotes', '/api/user/favorite-quotes');
    
    // ─── Summary ───
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║   RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
    console.log('╚══════════════════════════════════════════════════╝');
    
    if (failed > 0) {
        console.log('\n❌ FAILED ROUTES:');
    }
    
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Crashed:', e); process.exit(2); });
