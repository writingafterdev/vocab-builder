/**
 * Minimal Appwrite migration for Exercise V3.
 *
 * This is intentionally scoped to the shared question pool model so deployment
 * does not depend on the older broad "setup all attributes" scripts.
 */
const { Client, Databases, IndexType, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

if (!endpoint || !projectId || !apiKey) {
    throw new Error('Missing Appwrite env: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_API_KEY');
}

const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

const databases = new Databases(client);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const collections = [
    { id: 'exerciseQuestionPool', name: 'Exercise Question Pool' },
    { id: 'exerciseQuestionAttempts', name: 'Exercise Question Attempts' },
];

const attributes = {
    exerciseQuestionPool: [
        { key: 'phraseKey', type: 'string', size: 255, required: true },
        { key: 'phrase', type: 'string', size: 500, required: true },
        { key: 'learningBand', type: 'string', size: 50, required: true },
        { key: 'difficultyBand', type: 'string', size: 50 },
        { key: 'questions', type: 'string', size: 50000, required: true },
        { key: 'status', type: 'string', size: 50, required: true },
        { key: 'generationMode', type: 'string', size: 50 },
        { key: 'lexilePolicy', type: 'string', size: 1000 },
        { key: 'generatedAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
        { key: 'reuseCount', type: 'integer' },
        { key: 'qualityScore', type: 'float' },
    ],
    exerciseQuestionAttempts: [
        { key: 'userId', type: 'string', size: 255, required: true },
        { key: 'questionId', type: 'string', size: 255, required: true },
        { key: 'questionType', type: 'string', size: 100 },
        { key: 'learningBand', type: 'string', size: 50 },
        { key: 'testedPhraseIds', type: 'string', size: 5000 },
        { key: 'surface', type: 'string', size: 50, required: true },
        { key: 'correct', type: 'boolean', required: true },
        { key: 'userAnswer', type: 'string', size: 5000 },
        { key: 'completedAt', type: 'string', size: 100, required: true },
    ],
};

const indexes = [
    {
        collectionId: 'exerciseQuestionPool',
        key: 'pool_phrase_band_status',
        type: IndexType.Key,
        attributes: ['phraseKey', 'learningBand', 'status'],
        orders: ['asc', 'asc', 'asc'],
    },
    {
        collectionId: 'exerciseQuestionAttempts',
        key: 'attempts_user_completed',
        type: IndexType.Key,
        attributes: ['userId', 'completedAt'],
        orders: ['asc', 'desc'],
    },
    {
        collectionId: 'exerciseQuestionAttempts',
        key: 'attempts_user_question',
        type: IndexType.Key,
        attributes: ['userId', 'questionId'],
        orders: ['asc', 'asc'],
    },
];

async function ensureDatabase() {
    try {
        await databases.get(DB_ID);
        console.log(`Database exists: ${DB_ID}`);
    } catch (error) {
        if (error.code !== 404) throw error;
        await databases.create(DB_ID, DB_ID);
        console.log(`Created database: ${DB_ID}`);
    }
}

async function ensureCollections() {
    for (const collection of collections) {
        try {
            await databases.createCollection(
                DB_ID,
                collection.id,
                collection.name,
                [
                    Permission.read(Role.users()),
                    Permission.create(Role.users()),
                    Permission.update(Role.users()),
                    Permission.delete(Role.users()),
                ]
            );
            console.log(`Created collection: ${collection.id}`);
        } catch (error) {
            if (error.code === 409) {
                console.log(`Collection exists: ${collection.id}`);
                continue;
            }
            throw error;
        }
    }
}

async function ensureAttribute(collectionId, attr) {
    try {
        if (attr.type === 'string') {
            await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, attr.required === true);
        } else if (attr.type === 'integer') {
            await databases.createIntegerAttribute(DB_ID, collectionId, attr.key, attr.required === true);
        } else if (attr.type === 'float') {
            await databases.createFloatAttribute(DB_ID, collectionId, attr.key, attr.required === true);
        } else if (attr.type === 'boolean') {
            await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, attr.required === true);
        } else {
            throw new Error(`Unsupported attribute type: ${attr.type}`);
        }
        console.log(`Created attribute: ${collectionId}.${attr.key}`);
        await wait(1500);
    } catch (error) {
        if (error.code === 409) {
            console.log(`Attribute exists: ${collectionId}.${attr.key}`);
            return;
        }
        throw error;
    }
}

async function ensureAttributes() {
    for (const [collectionId, attrs] of Object.entries(attributes)) {
        for (const attr of attrs) {
            await ensureAttribute(collectionId, attr);
        }
    }
}

async function ensureIndexes() {
    for (const index of indexes) {
        try {
            await databases.createIndex(
                DB_ID,
                index.collectionId,
                index.key,
                index.type,
                index.attributes,
                index.orders
            );
            console.log(`Created index: ${index.collectionId}.${index.key}`);
            await wait(1500);
        } catch (error) {
            if (error.code === 409) {
                console.log(`Index exists: ${index.collectionId}.${index.key}`);
                continue;
            }
            throw error;
        }
    }
}

async function main() {
    console.log(`Setting up Exercise V3 Appwrite schema for project ${projectId}, database ${DB_ID}`);
    await ensureDatabase();
    await ensureCollections();
    await ensureAttributes();
    await ensureIndexes();
    console.log('Exercise V3 Appwrite schema is ready.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
