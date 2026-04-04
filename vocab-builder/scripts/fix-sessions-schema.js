#!/usr/bin/env node
/**
 * Add missing attributes to generatedSessions collection
 * so that practice article generation can write all fields.
 */
const { Client, Databases } = require('node-appwrite');

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function addAttribute(collectionId, key, type, opts = {}) {
    try {
        if (type === 'string') {
            await databases.createStringAttribute(DB_ID, collectionId, key, opts.size || 1000000, opts.required || false, opts.default, opts.array || false);
        } else if (type === 'integer') {
            await databases.createIntegerAttribute(DB_ID, collectionId, key, opts.required || false, opts.min, opts.max, opts.default, opts.array || false);
        } else if (type === 'boolean') {
            await databases.createBooleanAttribute(DB_ID, collectionId, key, opts.required || false, opts.default, opts.array || false);
        }
        console.log(`✅ Added ${type} attribute '${key}' to ${collectionId}`);
    } catch (e) {
        if (e.code === 409) {
            console.log(`⏭️  Attribute '${key}' already exists in ${collectionId}`);
        } else {
            console.error(`❌ Failed to add '${key}' to ${collectionId}:`, e.message);
        }
    }
}

async function main() {
    console.log('Adding missing attributes to generatedSessions...\n');
    
    // Missing: subtitle, sections, quotes, phraseIds, totalPhrases, isListeningDay, reviewDayIndex
    await addAttribute('generatedSessions', 'subtitle', 'string', { size: 500 });
    await addAttribute('generatedSessions', 'sections', 'string', { size: 1000000 });
    await addAttribute('generatedSessions', 'quotes', 'string', { size: 500000 });
    await addAttribute('generatedSessions', 'phraseIds', 'string', { size: 50000 });
    await addAttribute('generatedSessions', 'totalPhrases', 'integer', { min: 0, max: 100 });
    await addAttribute('generatedSessions', 'isListeningDay', 'boolean');
    await addAttribute('generatedSessions', 'reviewDayIndex', 'integer', { min: 0, max: 10000 });

    console.log('\nDone! Attributes may take a moment to become available.');
}

main().catch(console.error);
