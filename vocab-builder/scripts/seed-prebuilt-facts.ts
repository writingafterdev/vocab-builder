import fs from 'fs';
import path from 'path';
import { addQuotesToBank } from '../src/lib/db/quote-feed';
import { QuoteBankEntry } from '../src/lib/db/quote-feed';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Use a self-executing async function since Node scripts need to handle top-level await gracefully
async function runSeeder() {
    console.log("🌱 Starting Prebuilt Fact Seeder...");
    
    try {
        // Read the JSON file
        const dataPath = path.resolve(__dirname, '../src/data/prebuilt-facts.json');
        const fileContent = fs.readFileSync(dataPath, 'utf-8');
        const rawFacts = JSON.parse(fileContent);

        if (!Array.isArray(rawFacts) || rawFacts.length === 0) {
            console.error("❌ The prebuilt JSON file is empty or not an array.");
            process.exit(1);
        }

        console.log(`Found ${rawFacts.length} facts in JSON file to ingest into production database...`);

        // Convert the raw parsed facts into QuoteBankEntry formats
        const preparedFacts: Omit<QuoteBankEntry, 'id'>[] = rawFacts.map((fact: any) => ({
            text: fact.text,
            postId: fact.postId || `prebuilt_fact_${Math.random().toString(36).slice(2, 9)}`,
            postTitle: fact.postTitle,
            author: fact.author || "Vocab AI",
            source: fact.source || "Prebuilt Vault",
            topic: fact.topic,
            highlightedPhrases: fact.highlightedPhrases || [],
            sourceType: 'generated_fact' as const,
            createdAt: fact.createdAt || new Date().toISOString()
        }));

        // Upload to database
        console.log("📤 Pushing facts to Firestore Quote Bank...");
        await addQuotesToBank(preparedFacts);
        
        console.log(`✅ Success! ${preparedFacts.length} facts successfully injected into the global pool.`);
    } catch (e) {
        console.error("❌ Failed to run seeder:", e);
        process.exit(1);
    }
}

runSeeder().then(() => {
    // Wait for async operations to cleanly finish resolving pending requests
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});
