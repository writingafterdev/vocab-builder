import { config } from 'dotenv';
import * as path from 'path';

// Load .env.local synchronously before ANY other imports
config({ path: path.resolve(process.cwd(), '.env.local') });

// Force the project ID if it didn't load for some reason
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'hoctuvung-2c7e1';
}

// Now import the rest
import * as quoteFeed from '../src/lib/db/quote-feed';
import { getDocument, setDocument, deleteDocument } from '../src/lib/firestore-rest';

async function runTests() {
  console.log("Starting backend tests for Quote Feed Algorithm...");
  
  // Use a mock user ID for testing
  const testUserId = "test-user-" + Date.now();
  console.log(`Using test user ID: ${testUserId}`);

  try {
    // 0. Ensure Firestore REST API works
    try {
        await getDocument('quote_feed_state', testUserId);
    } catch (e: any) {
        if (e.status !== 404) {
            throw new Error("Firestore REST API connection failed: " + e.message);
        }
    }
    console.log("✅ Firestore REST API connected");

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
    const stateDoc = await getDocument('quote_feed_state', testUserId) as Record<string, any>;
    console.log("Feed State after onboarding:", stateDoc);
    if (!stateDoc?.hasCompletedOnboarding) throw new Error("Expected hasCompletedOnboarding to be true");
    if ((stateDoc.topicScores as Record<string, number>)['technology'] !== 5) throw new Error("Expected technology score to be 5");
    console.log("✅ Passed: Onboarding state saved correctly");

    // 3. Generate Feed (Should now work and prioritize chosen topics)
    console.log("\n--- Test 3: Generate Personalized Feed ---");
    // This will hit the real DB. If `quotes` collection is empty, it'll return empty list, which is fine for this test.
    const feed2 = await quoteFeed.getPersonalizedFeed(testUserId);
    console.log(`needsOnboarding: ${feed2.needsOnboarding}`);
    console.log(`Quotes returned: ${feed2.quotes.length}`);
    if (feed2.needsOnboarding) throw new Error("Expected needsOnboarding to be false");
    console.log("✅ Passed: Feed generated without error");

    // 4. Test View Tracking & Topic Boost
    console.log("\n--- Test 4: View Tracking and Topic Boost ---");
    const testQuoteIds = ['quote_test_1', 'quote_test_2', 'quote_test_3'];
    await quoteFeed.markQuotesViewed(testUserId, testQuoteIds);
    await quoteFeed.boostTopic(testUserId, 'technology');

    const stateAfter = await getDocument('quote_feed_state', testUserId) as Record<string, any>;
    
    console.log("Feed State after viewing and boosting:");
    console.log("- viewedQuoteIds length:", (stateAfter.viewedQuoteIds as string[] || []).length);
    console.log("- technology score:", (stateAfter.topicScores as Record<string, number>)['technology']);
    
    if ((stateAfter.viewedQuoteIds as string[] || []).length !== 3) throw new Error("Expected 3 viewed quotes");
    if ((stateAfter.topicScores as Record<string, number>)['technology'] !== 6) throw new Error("Expected technology score to be 6 (5 + 1 boost)");
    console.log("✅ Passed: View tracking and topic boost working");

    console.log("\n🎉 ALL TESTS PASSED");

  } catch (err: any) {
    console.error("\n❌ TEST FAILED:", err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    // Cleanup
    if (testUserId) {
      console.log("Cleaning up test data...");
      try {
        await deleteDocument('quote_feed_state', testUserId);
        console.log("✅ Test data cleaned up");
      } catch (e) {
        console.error("Cleanup failed:", e);
      }
    }
    process.exit(0);
  }
}

runTests();
