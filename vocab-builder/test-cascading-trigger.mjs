import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./.firebase-adminsdk.json', 'utf8'));

if (!initializeApp.length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'vocab-builder-test' // adjust if needed
  });
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
  // Actually, let's just write a ts-node script.
}

testCascadingTrigger();
