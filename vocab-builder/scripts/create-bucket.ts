import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Client, Storage } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const storage = new Storage(client);

async function setupBucket() {
    try {
        console.log('Checking Appwrite Buckets...');
        // We need a bucket for all files. Let's call it "main-storage".
        try {
            await storage.createBucket('main-storage', 'Main Storage');
            console.log('✅ Created Bucket: main-storage');
        } catch (e: any) {
            if (e.code === 409) {
                console.log('⏩ Bucket main-storage already exists.');
            } else {
                throw e;
            }
        }
    } catch (error) {
        console.error('Error setting up bucket:', error);
    }
}

setupBucket();
