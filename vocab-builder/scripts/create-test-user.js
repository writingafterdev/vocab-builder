#!/usr/bin/env node

/**
 * Creates a test user in Appwrite for easy email/password login during development.
 * 
 * Usage: node scripts/create-test-user.js
 */

const sdk = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const TEST_EMAIL = 'test@vocabbuilder.dev';
const TEST_PASSWORD = 'TestUser123!';
const TEST_NAME = 'Test User';

async function main() {
    const client = new sdk.Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);

    const users = new sdk.Users(client);

    try {
        // Check if user already exists by listing users with this email
        const existing = await users.list([sdk.Query.equal('email', TEST_EMAIL)]);

        if (existing.total > 0) {
            console.log('✅ Test user already exists:');
            console.log(`   ID:       ${existing.users[0].$id}`);
            console.log(`   Email:    ${TEST_EMAIL}`);
            console.log(`   Password: ${TEST_PASSWORD}`);
            return;
        }

        // Create the user
        const user = await users.create(
            sdk.ID.unique(),
            TEST_EMAIL,
            undefined, // phone
            TEST_PASSWORD,
            TEST_NAME
        );

        // Verify the email automatically so they can log in immediately
        await users.updateEmailVerification(user.$id, true);

        console.log('✅ Test user created successfully!');
        console.log(`   ID:       ${user.$id}`);
        console.log(`   Email:    ${TEST_EMAIL}`);
        console.log(`   Password: ${TEST_PASSWORD}`);
        console.log('');
        console.log('You can now log in with these credentials on the login page.');
    } catch (error) {
        if (error.code === 409) {
            console.log('⚠️  Test user already exists (conflict). Use these credentials:');
            console.log(`   Email:    ${TEST_EMAIL}`);
            console.log(`   Password: ${TEST_PASSWORD}`);
        } else {
            console.error('❌ Failed to create test user:', error.message || error);
        }
    }
}

main();
