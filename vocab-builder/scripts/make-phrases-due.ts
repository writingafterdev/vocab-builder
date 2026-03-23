import { queryCollection, updateDocument, runQuery } from '../src/lib/firestore-rest';

/**
 * Script to make all saved phrases for a user due immediately for testing.
 * Usage: npx tsx scripts/make-phrases-due.ts <userId>
 */

async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error("Error: Please provide a userId as an argument.");
        console.error("Usage: npx tsx scripts/make-phrases-due.ts <userId>");
        process.exit(1);
    }

    console.log(`Searching for savedPhrases for user: ${userId}...`);

    try {
        // Query saved phrases specifically for this user using runQuery
        const userPhrases = await runQuery('savedPhrases', [
            { field: 'userId', op: 'EQUAL', value: userId }
        ], 500);

        if (userPhrases.length === 0) {
            console.log("No phrases found for this user in top 100 documents.");
            return;
        }

        console.log(`Found ${userPhrases.length} phrases. Resetting nextReviewDate to now...`);

        for (const p of userPhrases) {
             const now = new Date();
             // Add 1 day to be safely in "tomorrow" for your automated test
             await updateDocument('savedPhrases', p.id, {
                 nextReviewDate: now.toISOString(),
                 learningStep: p.learningStep || 1 // Keep it in learning phase
             });
             console.log(`✅ Updated to Now: "${p.phrase}"`);
        }

        console.log("\nAll done! Total phrases due for review reset. Run your daily-import test script now.");

    } catch (err) {
        console.error("Error updating phrases:", err);
    }
}

main();
