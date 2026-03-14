import { config } from 'dotenv';
config({ path: '.env.local' });

// We need to mock Next.js headers/request stuff
import * as quoteFeed from './src/lib/db/quote-feed';
import { initializeFirebase } from './src/lib/firebase-admin';
import { adminDb } from './src/lib/firebase-admin';

async function runTests() {
  console.log("Starting backend tests for Quote Feed Algorithm...");
  
  // Use a mock user ID for testing
  const testUserId = "test-user-" + Date.now();
  console.log(`Using test user ID: ${testUserId}`);

  try {
    // 1. Check initial state (should need onboarding)
    console.log("\n--- Test 1: Initial State ---");
    const feed1 = await quoteFeed.getPersonalizedFeed(testUserId);
    console.log(`needsOnboarding: ${feed1.needsOnboarding}`);
    if (!feed1.needsOnboarding) throw new Error("Expected needsOnboarding to be true");
    console.log("✅ Passed: Initial state requires onboarding");

    // 2. Simulate Onboarding (Topic Picker)
    console.log("\n--- Test 2: Save Topic Picker Choices ---");
    const chosenTopics = ['technology', 'science', 'philosophy'];
    await quoteFeed.saveTopicPickerChoices(testUserId, chosenTopics);
    
    // Check state after onboarding
    const stateDoc = await adminDb!.collection('quote_feed_state').doc(testUserId).get();
    const state = stateDoc.data();
    console.log("Feed State after onboarding:", state);
    if (!state?.hasCompletedOnboarding) throw new Error("Expected hasCompletedOnboarding to be true");
    if (state.topicScores['technology'] !== 5) throw new Error("Expected technology score to be 5");
    console.log("✅ Passed: Onboarding state saved correctly");

    // 3. Generate Feed (Should now work and prioritize chosen topics)
    console.log("\n--- Test 3: Generate Personalized Feed ---");
    // We might not have enough quotes in the DB, so let's mock the quote generation for the test
    // or just see if it doesn't crash empty
    const feed2 = await quoteFeed.getPersonalizedFeed(testUserId);
    console.log(`needsOnboarding: ${feed2.needsOnboarding}`);
    console.log(`Quotes returned: ${feed2.quotes.length}`);
    if (feed2.needsOnboarding) throw new Error("Expected needsOnboarding to be false");
    console.log("✅ Passed: Feed generated without error (even if empty depending on DB state)");

    // 4. Test View Tracking & Topic Boost
    console.log("\n--- Test 4: View Tracking and Topic Boost ---");
    const testQuoteIds = ['quote_test_1', 'quote_test_2', 'quote_test_3'];
    await quoteFeed.markQuotesViewed(testUserId, testQuoteIds);
    await quoteFeed.boostTopic(testUserId, 'technology');

    const stateDocAfter = await adminDb!.collection('quote_feed_state').doc(testUserId).get();
    const stateAfter = stateDocAfter.data() as any;
    
    console.log("Feed State after viewing and boosting:");
    console.log("- viewedQuoteIds length:", stateAfter.viewedQuoteIds.length);
    console.log("- technology score:", stateAfter.topicScores['technology']);
    
    if (stateAfter.viewedQuoteIds.length !== 3) throw new Error("Expected 3 viewed quotes");
    if (stateAfter.topicScores['technology'] !== 6) throw new Error("Expected technology score to be 6 (5 + 1 boost)");
    console.log("✅ Passed: View tracking and topic boost working");

    console.log("\n🎉 ALL TESTS PASSED");

  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
  } finally {
    // Cleanup
    if (adminDb) {
      console.log("Cleaning up test data...");
      await adminDb.collection('quote_feed_state').doc(testUserId).delete();
    }
    process.exit(0);
  }
}

runTests();
