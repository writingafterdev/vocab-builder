/**
 * Idempotently seed the global nativeWordPool collection.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';
const COLLECTION_ID = 'nativeWordPool';
const seedPath = path.join(__dirname, '..', 'data', 'native-beautiful-words.seed.json');
const force = process.argv.includes('--force');

if (!endpoint || !projectId || !apiKey) {
    throw new Error('Missing Appwrite env: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_API_KEY');
}

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const databases = new Databases(client);
let writableNativeWordAttrs = null;

function normalizeWordKey(word) {
    return String(word || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s-]+/g, '_')
        .replace(/^_+/, '')
        .slice(0, 80);
}

function docIdForWord(wordKey) {
    return `nwp${crypto.createHash('sha1').update(wordKey).digest('hex').slice(0, 32)}`;
}

function validateEntry(entry, index) {
    const errors = [];
    for (const field of ['word', 'definition', 'vibe', 'register', 'difficulty', 'example', 'followupText', 'status']) {
        if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
            errors.push(`item ${index}: missing ${field}`);
        }
    }
    if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
        errors.push(`item ${index}: missing tags`);
    }
    if (typeof entry.qualityScore !== 'number' || entry.qualityScore < 0 || entry.qualityScore > 1) {
        errors.push(`item ${index}: invalid qualityScore`);
    }
    if (!normalizeWordKey(entry.word)) {
        errors.push(`item ${index}: invalid wordKey`);
    }
    return errors;
}

async function findExisting(wordKey) {
    const result = await databases.listDocuments(DB_ID, COLLECTION_ID, [
        Query.equal('wordKey', wordKey),
        Query.limit(1),
    ]);
    return result.documents[0] || null;
}

async function getWritableNativeWordAttrs() {
    if (writableNativeWordAttrs) return writableNativeWordAttrs;
    const attrs = await databases.listAttributes(DB_ID, COLLECTION_ID);
    writableNativeWordAttrs = new Set((attrs.attributes || [])
        .filter((attr) => attr.status === 'available')
        .map((attr) => attr.key));
    return writableNativeWordAttrs;
}

function filterToSchema(data, attrs) {
    return Object.fromEntries(Object.entries(data).filter(([key]) => attrs.has(key)));
}

async function upsertEntry(entry) {
    const now = new Date().toISOString();
    const wordKey = normalizeWordKey(entry.word);
    const payload = {
        seedVersion: entry.seedVersion || 1,
        source: 'manual_seed',
    };
    const data = {
        wordKey,
        word: entry.word,
        definition: entry.definition,
        vibe: entry.vibe,
        register: entry.register,
        difficulty: entry.difficulty,
        tags: JSON.stringify(entry.tags),
        example: entry.example,
        followupText: entry.followupText,
        qualityScore: entry.qualityScore,
        status: entry.status,
        payload: JSON.stringify(payload),
        updatedAt: now,
    };

    const attrs = await getWritableNativeWordAttrs();
    const existing = await findExisting(wordKey);
    if (existing) {
        if (!force && existing.payload) {
            let currentPayload = {};
            try {
                currentPayload = JSON.parse(existing.payload || '{}');
            } catch {
                currentPayload = {};
            }
            if (currentPayload.source !== 'manual_seed') {
                return { action: 'skipped', wordKey };
            }
        }
        await databases.updateDocument(DB_ID, COLLECTION_ID, existing.$id, filterToSchema(data, attrs));
        return { action: 'updated', wordKey };
    }

    await databases.createDocument(DB_ID, COLLECTION_ID, docIdForWord(wordKey), filterToSchema({
        ...data,
        createdAt: now,
    }, attrs));
    return { action: 'created', wordKey };
}

async function main() {
    const raw = fs.readFileSync(seedPath, 'utf8');
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) {
        throw new Error('Seed file must be a JSON array');
    }

    const errors = entries.flatMap(validateEntry);
    if (errors.length > 0) {
        throw new Error(`Invalid seed file:\n${errors.join('\n')}`);
    }

    const counts = { created: 0, updated: 0, skipped: 0 };
    for (const entry of entries) {
        const result = await upsertEntry(entry);
        counts[result.action] += 1;
        console.log(`${result.action}: ${result.wordKey}`);
    }

    console.log(`Seed complete: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} skipped.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
