import { uploadToAppwriteStorage, deleteFromAppwriteStorage } from '../src/lib/appwrite/storage';

// Convert Next.js environment variables to local script execution env
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testStorage() {
    try {
        console.log('Testing Appwrite Storage Migration...');
        
        const testContent = "This is a test audio file generated during the Appwrite Migration.";
        const buffer = Buffer.from(testContent);
        
        console.log('1. Uploading file to main-storage bucket...');
        const url = await uploadToAppwriteStorage(buffer, 'test-audio-file', 'text/plain');
        
        if (!url) {
            console.error('❌ Failed! No URL returned.');
            process.exit(1);
        }
        
        console.log('✅ Success! Uploaded to Appwrite. Download URL:', url);
        
        console.log('2. Deleting test file from bucket...');
        const deleted = await deleteFromAppwriteStorage(url);
        
        if (deleted) {
            console.log('✅ Success! Deleted test file.');
        } else {
            console.error('❌ Failed! Could not delete file.');
            process.exit(1);
        }

        console.log('\\nStorage Migration works perfectly!');
    } catch (error) {
        console.error('Test script crashed:', error);
        process.exit(1);
    }
}

testStorage();
