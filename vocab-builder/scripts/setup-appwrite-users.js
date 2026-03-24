const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function setupUsersCollection() {
    console.log('Verifying Users collection attributes in Appwrite...');
    const colId = 'users';

    const attributes = [
        { key: 'uid', type: 'string', size: 255, required: true },
        { key: 'email', type: 'string', size: 255, required: false },
        { key: 'displayName', type: 'string', size: 255, required: false },
        { key: 'username', type: 'string', size: 255, required: false },
        { key: 'bio', type: 'string', size: 1000, required: false },
        { key: 'photoURL', type: 'string', size: 1000, required: false },
        { key: 'role', type: 'string', size: 50, required: false },
        { key: 'createdAt', type: 'string', size: 100, required: false },
        { key: 'lastActiveAt', type: 'string', size: 100, required: false },
        { key: 'stats', type: 'string', size: 2000, required: false },
        { key: 'subscription', type: 'string', size: 2000, required: false },
        { key: 'settings', type: 'string', size: 1000, required: false }
    ];

    for (const attr of attributes) {
        try {
            await databases.createStringAttribute(DB_ID, colId, attr.key, attr.size, attr.required);
            console.log(`✅ Created attribute: ${attr.key}`);
            // Appwrite requires a short wait after creating attributes before using them
            await new Promise(res => setTimeout(res, 2000)); 
        } catch (e) {
            if (e.code === 409) {
                console.log(`⚡ Attribute already exists: ${attr.key}`);
            } else {
                console.error(`❌ Failed to create attribute ${attr.key}:`, e.message);
            }
        }
    }
    console.log('\nDone! Your Appwrite Users collection is fully structured!');
}

setupUsersCollection();
