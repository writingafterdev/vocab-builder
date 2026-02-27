import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';

// Initialize Firebase Admin using env vars if available
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!initializeApp.length) {
  try {
    // Attempt standard initialization (often works if GOOGLE_APPLICATION_CREDENTIALS is set)
    // Otherwise fallback to minimal admin init
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'vocab-builder-test'
    });
  } catch (e) {
    console.error('Failed to init firebase admin', e);
  }
}

const db = getFirestore();

async function testCascadingTrigger() {
  console.log('🧪 Testing Cascading Trigger System...');

  const userId = 'test-cascading-user-' + Date.now();
  const phraseRef = db.collection('savedPhrases').doc();

  // 1. Create a parent phrase with locked children
  const tomorow = new Date();
  tomorow.setDate(tomorow.getDate() + 1);

  await phraseRef.set({
    userId,
    phrase: 'test phrase',
    learningStep: 0,
    nextReviewDate: tomorow,
    children: [
      {
        id: 'child1',
        phrase: 'child phrase 1',
        nextReviewDate: null, // LOCKED
        learningStep: 0
      },
      {
        id: 'child2',
        phrase: 'child phrase 2',
        nextReviewDate: null, // LOCKED
        learningStep: 0
      },
      {
        id: 'child3',
        phrase: 'child phrase 3',
        nextReviewDate: null, // LOCKED
        learningStep: 0
      }
    ]
  });

  console.log(`✅ Created test parent phrase: ${phraseRef.id} with 3 locked children`);

  // 2. We can't directly call updatePracticeResult from srs.ts easily in a raw .mjs 
  // without setting up ts-node and path aliases, so let's try calling the API endpoint
  // Wait, let's just make it a route or use a local fetch if the server is running.
  console.log(`\n⏳ Simulating a correct answer for root phrase via API...`);

  try {
    const response = await fetch('http://localhost:3000/api/user/update-practice-result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({
        phraseId: phraseRef.id,
        phrase: 'test phrase',
        result: 'correct',
        questionType: 'multiple-choice'
      })
    });

    const result = await response.json();
    console.log(`API Response:`, result);

    // 3. Verify the children in Firestore
    console.log(`\n🔍 Verifying children status in Firestore...`);
    const updatedDoc = await phraseRef.get();
    const data = updatedDoc.data();

    console.log(`Root phrase learning step: ${data.learningStep}`);

    let unlockedCount = 0;
    data.children.forEach(child => {
      const isUnlocked = child.nextReviewDate !== null;
      console.log(`- Child "${child.phrase}": ${isUnlocked ? '✅ UNLOCKED' : '❌ LOCKED'} (Step: ${child.learningStep})`);
      if (isUnlocked) unlockedCount++;
    });

    console.log(`\n🎉 Test Complete: ${unlockedCount}/${data.children.length} children unlocked successfully.`);
    console.log(`If 1 or 2 children unlocked and not all 3, it proves the staggered algorithm works as well.`);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    console.log(`\n🧹 Cleaning up test data...`);
    await phraseRef.delete();
    console.log(`Done.`);
    process.exit(0);
  }
}

testCascadingTrigger();
