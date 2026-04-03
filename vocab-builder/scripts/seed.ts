import { Client, Users, Databases, ID, Query } from 'node-appwrite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const users = new Users(client);
const databases = new Databases(client);

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function seed() {
    console.log('🌱 Starting seed...');

    let userIdStr = '';
    const email = 'test@vocabbuilder.dev';
    const password = 'TestUser123!';

    try {
        console.log('Creating test user in Auth...');
        const user = await users.create(ID.unique(), email, undefined, password, 'Test User');
        userIdStr = user.$id;
        console.log(`✅ Created test user with ID: ${userIdStr}`);
    } catch (e: any) {
        if (e.code === 409) {
            console.log('User already exists, fetching ID...');
            const userList = await users.list([Query.equal('email', [email])]);
            if (userList.users.length > 0) {
                userIdStr = userList.users[0].$id;
                console.log(`✅ Found existing test user with ID: ${userIdStr}`);
                
                // Try to update password just in case it doesn't match
                await users.updatePassword(userIdStr, password);
                console.log('Password reset to TestUser123!');
            }
        } else {
            throw e;
        }
    }

    // Now seed some savedPhrases for this user
    console.log('Seeding saved phrases for user...');
    
    // Clear old items first
    try {
        const oldPhrases = await databases.listDocuments(DB_ID, 'savedPhrases', [
            Query.equal('userId', [userIdStr])
        ]);
        for (const doc of oldPhrases.documents) {
            await databases.deleteDocument(DB_ID, 'savedPhrases', doc.$id);
        }
        console.log(`Cleaned up ${oldPhrases.documents.length} old phrases.`);
    } catch (e) {
        console.log('No old phrases or could not wipe.', e);
    }

    const phrasesToSeed = [
        {
            phrase: "ubiquitous",
            meaning: "present, appearing, or found everywhere",
            register: "formal",
            userId: userIdStr,
            topics: ["General"],
            learningStep: 1,
            completedFormats: [],
            nextReviewDate: new Date().toISOString() // Due now
        },
        {
            phrase: "ephemeral",
            meaning: "lasting for a very short time",
            register: "literary",
            userId: userIdStr,
            topics: ["General"],
            learningStep: 2,
            completedFormats: ["multiple_choice"],
            nextReviewDate: new Date().toISOString() // Due now
        },
        {
            phrase: "pragmatic",
            meaning: "dealing with things sensibly and realistically",
            register: "neutral",
            userId: userIdStr,
            topics: ["Business"],
            learningStep: 1,
            completedFormats: [],
            nextReviewDate: new Date(Date.now() + 86400000).toISOString() // Due tomorrow
        }
    ];

    for (const data of phrasesToSeed) {
        await databases.createDocument(DB_ID, 'savedPhrases', ID.unique(), data);
    }
    console.log(`✅ Seeded ${phrasesToSeed.length} saved phrases for test user!`);

    console.log('✅ Seed complete. You can now login with test@vocabbuilder.dev / TestUser123!');
}

seed().catch(err => {
    console.error('Seed failed:', err);
});
