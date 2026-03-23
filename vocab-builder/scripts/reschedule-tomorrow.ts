import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { queryCollection, updateDocument } from '../src/lib/firestore-rest';

async function reschedulePhrases() {
    console.log('Fetching all saved phrases...');
    const allPhrases = await queryCollection('savedPhrases');
    
    console.log(`Found ${allPhrases.length} phrases. Rescheduling to tomorrow...`);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    let count = 0;
    for (const phrase of allPhrases) {
        if (!phrase.id) continue;
        
        try {
            await updateDocument('savedPhrases', phrase.id as string, {
                nextReviewDate: tomorrow
            });
            count++;
            if (count % 50 === 0) console.log(`Rescheduled ${count}/${allPhrases.length}...`);
        } catch (e: any) {
            console.error(`Error updating phrase ${phrase.id}:`, e.message);
        }
    }
    
    console.log(`Successfully rescheduled ${count} phrases to ${tomorrow.toISOString()}.`);
}

reschedulePhrases().catch(console.error);
