import { Client, Users, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const usersApi = new Users(client);

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function migrateAuth() {
    console.log('Fetching users from Appwrite Database...');
    const result = await databases.listDocuments(DB_ID, 'users', [Query.limit(100)]);
    console.log(`Found ${result.documents.length} users to migrate to Appwrite Auth.`);

    for (const doc of result.documents) {
        const uid = doc.$id;
        const email = doc.email;
        const name = doc.displayName || 'Appwrite User';

        try {
            await usersApi.create(
                uid,
                email,
                undefined, // phone
                undefined, // password
                name
            );
            console.log(`✅ Created Auth Account for ${email} (uid: ${uid})`);
        } catch (e: any) {
            if (e.code === 409) {
                console.log(`⏩ Auth Account for ${email} already exists. Skipping.`);
            } else {
                console.error(`❌ Failed to create Auth Account for ${email}:`, e.message);
            }
        }
    }
    console.log('--- Auth Migration Complete ---');
}

migrateAuth().catch(console.error);
