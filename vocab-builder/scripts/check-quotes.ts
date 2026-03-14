import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'hoctuvung-2c7e1';
}

import { queryCollection } from '../src/lib/firestore-rest';

async function checkQuotes() {
    try {
        const quotes = await queryCollection('quotes');
        console.log(`Total quotes in db: ${quotes.length}`);
        
        // Count how many unique post ids we have
        const postIds = new Set(quotes.map(q => q.postId));
        console.log(`Quotes come from ${postIds.size} different posts.`);
    } catch (e) {
        console.error(e);
    }
}

checkQuotes();
