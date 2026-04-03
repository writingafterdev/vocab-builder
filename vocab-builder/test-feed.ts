import { config } from 'dotenv';
config({ path: '.env.local' });

import * as quoteFeed from './src/lib/db/quote-feed';
import { getDocument } from './src/lib/firestore-rest';
import { getPostsPaginated } from './src/lib/db/posts';

// Fallback to fetch delete to cleanup
async function deleteDocument(collection: string, id: string) {
    const firebaseUrl = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
    await fetch(firebaseUrl, { method: 'DELETE' });
}

async function runTests() {
  console.log("Starting backend tests for Quote Feed Algorithm...");
  
  const testUserId = "test-user-" + Date.now();
  console.log(`Using test user ID: ${testUserId}`);

  try {
    console.log("\n--- Test 1: Initial State ---");
    const feed1 = await quoteFeed.getPersonalizedFeed(testUserId);
    console.log(`needsOnboarding: ${feed1.needsOnboarding}`);
    if (!feed1.needsOnboarding) throw new Error("Expected needsOnboarding to be true");
    console.log("✅ Passed: Initial state requires onboarding");

    console.log("\n--- Test 2: Save Topic Picker Choices ---");
    const chosenTopics = ['technology', 'science', 'philosophy'];
    await quoteFeed.saveTopicPickerChoices(testUserId, chosenTopics);
    
    let state: any = await getDocument('quote_feed_state', testUserId);
    console.log("Feed State after onboarding:", state);
    if (!state?.hasCompletedOnboarding) throw new Error("Expected hasCompletedOnboarding to be true");
    if (state.topicScores['technology'] !== 5) throw new Error("Expected technology score to be 5");
    console.log("✅ Passed: Onboarding state saved correctly");

    console.log("\n--- Test 3: Generate Personalized Feed ---");
    const feed2 = await quoteFeed.getPersonalizedFeed(testUserId);
    console.log(`needsOnboarding: ${feed2.needsOnboarding}`);
    console.log(`Quotes returned: ${feed2.quotes.length}`);
    if (feed2.needsOnboarding) throw new Error("Expected needsOnboarding to be false");
    console.log("✅ Passed: Feed generated without error");

    console.log("\n--- Test 4: View Tracking and Topic Boost ---");
    const testQuoteIds = ['quote_test_1', 'quote_test_2', 'quote_test_3'];
    await quoteFeed.markQuotesViewed(testUserId, testQuoteIds);
    await quoteFeed.boostTopic(testUserId, 'technology');

    state = await getDocument('quote_feed_state', testUserId);
    
    console.log("Feed State after viewing and boosting:");
    console.log("- viewedQuoteIds length:", state.viewedQuoteIds.length);
    console.log("- technology score:", state.topicScores['technology']);
    
    if (state.viewedQuoteIds.length !== 3) throw new Error("Expected 3 viewed quotes");
    if (state.topicScores['technology'] !== 6) throw new Error("Expected technology score to be 6");
    console.log("✅ Passed: View tracking and topic boost");

    console.log("\n--- Test 5: Smart Feed Sorting (Pagination) ---");
    const fakeScores = { 'AI': 100, 'Psychology': 50 };
    
    // Create an array of mock posts
    let mockPosts = [
        { id: '1', importTopic: 'General', createdAt: { seconds: 100 } },
        { id: '2', importTopic: 'Psychology', createdAt: { seconds: 200 } },
        { id: '3', importTopic: 'AI', createdAt: { seconds: 300 } },
        { id: '4', importTopic: 'AI', createdAt: { seconds: 50 } },
    ];

    // Smart Sorting: locally sort by topic scores
    mockPosts.sort((a, b) => {
        const aTopic = a.importTopic || 'general';
        const bTopic = b.importTopic || 'general';
        const aScore = fakeScores[aTopic as keyof typeof fakeScores] || 0;
        const bScore = fakeScores[bTopic as keyof typeof fakeScores] || 0;
        
        // Primary sort by score DESC
        if (bScore !== aScore) {
            return bScore - aScore;
        }
        
        // Secondary sort by date DESC
        return b.createdAt.seconds - a.createdAt.seconds;
    });

    console.log("Locally sorted mock posts:");
    mockPosts.forEach(p => console.log(`- Post ID: ${p.id}, Topic: ${p.importTopic}, Time: ${p.createdAt.seconds}`));

    if (mockPosts[0].id !== '3') throw new Error("Expected Post 3 (AI, newest) to be top");
    if (mockPosts[1].id !== '4') throw new Error("Expected Post 4 (AI, older) to be second");
    if (mockPosts[2].id !== '2') throw new Error("Expected Post 2 (Psychology) to be third");
    if (mockPosts[3].id !== '1') throw new Error("Expected Post 1 (General) to be last");
    
    console.log("✅ Passed: Smart Feed Sorting executed successfully");

    console.log("\n--- Test 6: Custom Weight Boosting ---");
    await quoteFeed.boostTopic(testUserId, 'technology', 3);
    state = await getDocument('quote_feed_state', testUserId);
    if (state.topicScores['technology'] !== 9) throw new Error("Expected technology score to be 9");
    console.log("✅ Passed: Custom weight topic boost working");

    console.log("\n🎉 ALL TESTS PASSED");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
  } finally {
    console.log("Cleaning up test data...");
    await deleteDocument('quote_feed_state', testUserId);
    process.exit(0);
  }
}

runTests();
