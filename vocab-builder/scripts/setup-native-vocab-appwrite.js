/**
 * Minimal Appwrite schema setup for goal-based native vocabulary.
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
    { id: 'nativeWordPool', name: 'Native Word Pool' },
    { id: 'userNativeWords', name: 'User Native Words' },
    { id: 'nativeFeedState', name: 'Native Feed State' },
];

const attributes = {
    quote_feed_state: [
        { key: 'learningGoal', type: 'string', size: 100 },
    ],
    nativeWordPool: [
        { key: 'wordKey', type: 'string', size: 255, required: true },
        { key: 'word', type: 'string', size: 255, required: true },
        { key: 'definition', type: 'string', size: 1000, required: true },
        { key: 'vibe', type: 'string', size: 255, required: true },
        { key: 'register', type: 'string', size: 100, required: true },
        { key: 'difficulty', type: 'string', size: 100, required: true },
        { key: 'tags', type: 'string', size: 2000, required: true },
        { key: 'example', type: 'string', size: 1000, required: true },
        { key: 'followupText', type: 'string', size: 2000, required: true },
        { key: 'qualityScore', type: 'float', required: true },
        { key: 'status', type: 'string', size: 50, required: true },
        { key: 'createdAt', type: 'string', size: 100 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],
    userNativeWords: [
        { key: 'userId', type: 'string', size: 255, required: true },
        { key: 'wordKey', type: 'string', size: 255, required: true },
        { key: 'word', type: 'string', size: 255, required: true },
        { key: 'definition', type: 'string', size: 1000, required: true },
        { key: 'status', type: 'string', size: 50, required: true },
        { key: 'savedAt', type: 'string', size: 100, required: true },
        { key: 'updatedAt', type: 'string', size: 100 },
        { key: 'sourceCardId', type: 'string', size: 255 },
        { key: 'payload', type: 'string', size: 5000 },
    ],
    nativeFeedState: [
        { key: 'userId', type: 'string', size: 255, required: true },
        { key: 'viewedNativeWordKeys', type: 'string', size: 10000 },
        { key: 'servedNativeFollowupKeys', type: 'string', size: 5000 },
        { key: 'updatedAt', type: 'string', size: 100 },
    ],
};

const indexes = [
    {
        collectionId: 'nativeWordPool',
        key: 'native_word_key',
        type: IndexType.Unique,
        attributes: ['wordKey'],
        orders: ['asc'],
    },
    {
        collectionId: 'nativeWordPool',
        key: 'native_word_status_quality',
        type: IndexType.Key,
        attributes: ['status', 'qualityScore'],
        orders: ['asc', 'desc'],
    },
    {
        collectionId: 'userNativeWords',
        key: 'user_native_word_lookup',
        type: IndexType.Unique,
        attributes: ['userId', 'wordKey'],
        orders: ['asc', 'asc'],
    },
    {
        collectionId: 'userNativeWords',
        key: 'user_native_word_status',
        type: IndexType.Key,
        attributes: ['userId', 'status'],
        orders: ['asc', 'asc'],
    },
    {
        collectionId: 'nativeFeedState',
        key: 'native_feed_state_user',
        type: IndexType.Unique,
        attributes: ['userId'],
        orders: ['asc'],
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
        } else if (attr.type === 'float') {
            await databases.createFloatAttribute(DB_ID, collectionId, attr.key, attr.required === true);
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
        if (collectionId === 'quote_feed_state' && error.type === 'attribute_limit_exceeded') {
            console.warn(`Skipped ${collectionId}.${attr.key}: collection attribute limit reached.`);
            return;
        }
        if (error.type === 'attribute_limit_exceeded' && attr.required !== true) {
            console.warn(`Skipped optional attribute ${collectionId}.${attr.key}: collection attribute limit reached.`);
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
            await databases.createIndex(DB_ID, index.collectionId, index.key, index.type, index.attributes, index.orders);
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
    console.log(`Setting up native vocabulary schema for project ${projectId}, database ${DB_ID}`);
    await ensureDatabase();
    await ensureCollections();
    await ensureAttributes();
    await ensureIndexes();
    console.log('Native vocabulary Appwrite schema is ready.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
