const { Client, Databases, ID, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

async function seedDuePhrases() {
    console.log('Fetching users to seed due phrases...');
    
    try {
        const usersRes = await databases.listDocuments(DB_ID, 'users', [
            Query.limit(100)
        ]);
        
        let targetUserIds = [];
        
        if (usersRes.total === 0) {
            console.log('No users found in database. Using a fallback user ID.');
            targetUserIds = ['test-fallback-user'];
        } else {
            targetUserIds = usersRes.documents.map(u => u.uid || u.$id);
            console.log(`Found ${targetUserIds.length} users. Seeding for all...`);
        }
        
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        const fallbackCreated = new Date(Date.now() - 86400000 * 2).toISOString();
        
        const mockPhrases = [
            {
                phrase: 'cognitive dissonance',
                definition: 'The mental discomfort experienced by someone who holds two or more contradictory beliefs.',
                topic: 'psychology',
                difficulty: 'intermediate',
                mastery: 1,
                reviewCount: 1,
                correctCount: 0,
                incorrectCount: 0,
                nextReviewDate: yesterday,
                lastReviewedAt: fallbackCreated,
                createdAt: fallbackCreated,
            },
            {
                phrase: 'break the ice',
                definition: 'To do or say something to relieve tension or get conversation going at the start of a party or when people meet for the first time.',
                topic: 'social',
                difficulty: 'beginner',
                mastery: 1,
                reviewCount: 1,
                correctCount: 0,
                incorrectCount: 0,
                nextReviewDate: yesterday,
                lastReviewedAt: fallbackCreated,
                createdAt: fallbackCreated,
            },
            {
                phrase: 'hit the ground running',
                definition: 'Start something and proceed at a fast pace with great enthusiasm.',
                topic: 'business',
                difficulty: 'intermediate',
                mastery: 2,
                reviewCount: 2,
                correctCount: 1,
                incorrectCount: 0,
                nextReviewDate: yesterday,
                lastReviewedAt: fallbackCreated,
                createdAt: fallbackCreated,
            }
        ];

        let seedCount = 0;
        for (const userId of targetUserIds) {
            for (const mock of mockPhrases) {
                const docId = ID.unique();
                await databases.createDocument(DB_ID, 'savedPhrases', docId, {
                    ...mock,
                    userId: userId
                });
                seedCount++;
            }
        }
        
        console.log(`✅ Successfully seeded ${seedCount} due phrases across ${targetUserIds.length} users!`);
        
    } catch (e) {
        console.error('Failed to seed:', e);
    }
}

seedDuePhrases();
