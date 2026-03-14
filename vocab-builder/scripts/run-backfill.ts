import { config } from 'dotenv';
import * as path from 'path';

// Load .env.local synchronously before ANY other imports
config({ path: path.resolve(process.cwd(), '.env.local') });

// Force the project ID if it didn't load for some reason
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'hoctuvung-2c7e1';
}

import { getDocument, setDocument, queryCollection, addDocument, runQuery } from '../src/lib/firestore-rest';
import { extractAndSaveQuotes } from '../src/lib/quote-extraction';
import { addQuotesToBank } from '../src/lib/db/quote-feed';

async function runBackfill() {
  console.log("Starting Quote Backfill process via CLI...");
  try {
    const limit = 1000;
    const skipExisting = true;
    const posts = await queryCollection('posts', { limit });

    console.log(`Found ${posts.length} posts to process (requested limit: ${limit})`);
    
    let processed = 0;
    let skipped = 0;
    let totalExtracted = 0;

    for (const post of posts) {
      try {
        const existingQuotes = await runQuery('quotes', [
            { field: 'postId', op: 'EQUAL', value: post.id as unknown as string }
        ], 1);
        
        if (skipExisting && existingQuotes && existingQuotes.length > 0) {
             console.log(`Skipping post ${post.id} (already has standalone quotes)`);
             skipped++;
             continue;
        }
      } catch (e) {
          console.error("  Error checking for existing quotes", e);
      }

      const textToProcess = post.content || post.description || '';
      const topic = post.importTopic as string || 'General';

      if (post.extractedQuotes && Array.isArray(post.extractedQuotes) && post.extractedQuotes.length > 0) {
        console.log(`Migrating existing embedded quotes for post ${post.id}`);
        try {
            const quoteEntries = post.extractedQuotes.map((text: string) => ({
                text,
                postId: post.id,
                postTitle: post.title as string || '',
                author: post.author as string || 'Unknown',
                source: post.source as string || 'Article',
                topic: topic,
                highlightedPhrases: [] as string[],
                sourceType: 'article' as const,
                createdAt: new Date().toISOString(),
            }));
            await addQuotesToBank(quoteEntries);
            console.log(`  Migrated ${quoteEntries.length} quotes.`);
            totalExtracted += quoteEntries.length;
            processed++;
        } catch (e: any) {
            console.error(`  Error migrating quotes for ${post.id}`, e.message);
        }
        continue;
      }
      
      console.log(`Processing post ${post.id}: "${post.title}"`);
      
      if (!textToProcess) {
        console.log(`  Skipping: No content to process.`);
        continue;
      }
      
      try {
         const quotes = await extractAndSaveQuotes(
            post.id,
            textToProcess,
            post.title as string || '',
            post.author as string || '',
            post.source as string || '',
            topic
        );
        console.log(`  Extracted ${quotes.length} quotes.`);
        totalExtracted += quotes.length;
        processed++;
      } catch (e: any) {
          console.error(`  Error extracting quotes for ${post.id}`, e.message);
      }
    }
    
    console.log(`\nBackfill complete!`);
    console.log(`- Processed: ${processed}`);
    console.log(`- Skipped (already had quotes): ${skipped}`);
    console.log(`- Total new quotes extracted: ${totalExtracted}`);
    
  } catch (error: any) {
    console.error("Backfill failed:", error);
  } finally {
      process.exit(0);
  }
}

runBackfill();
