import { queryCollection, updateDocument } from '../src/lib/firestore-rest';

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
        // Query ALL saved phrases
        // Note: runQuery might be better for high volumes, but queryCollection works on first 100
        const phrases = await queryCollection('savedPhrases');
        const userPhrases = phrases.filter(p => p.userId === userId);

        if (userPhrases.length === 0) {
            console.log("No phrases found for this user in top 100 documents.");
            return;
        }

        console.log(`Found ${userPhrases.length} phrases. Resetting nextReviewDate to now...`);

        for (const p of userPhrases) {
             const now = new Date();
             // Subtract 1 day to be safely in the "past" so it is definitely due
             const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
             
             await updateDocument('savedPhrases', p.id, {
                 nextReviewDate: yesterday.toISOString(),
                 learningStep: p.learningStep || 1 // Keep it in learning phase to trigger practice articles
             });
             console.log(`✅ Updated: "${p.phrase}"`);
        }

        console.log("\nAll done! Total phrases due for review reset. Run your daily-import test script now.");

    } catch (err) {
        console.error("Error updating phrases:", err);
    }
}

main();
