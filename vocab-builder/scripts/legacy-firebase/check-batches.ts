import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, getDocument } from '../src/lib/firestore-rest';
import { getBatchStatus, getAllBatchResults } from '../src/lib/grok-batch';

async function checkBatches() {
    console.log('Fetching active batch jobs from Firestore...');
    const activeJobs = await runQuery('batchJobs', [], 5);

    console.log(`Found ${activeJobs.length} recent jobs.`);

    for (const job of activeJobs) {
        console.log(`\n--- Job ${job.id} ---`);
        console.log(`Type: ${job.type}`);
        console.log(`Batch ID: ${job.batchId}`);
        console.log(`Created: ${job.createdAt}`);

        try {
            const status = await getBatchStatus(job.batchId as string);
            console.log(`Grok Status: ${JSON.stringify(status.state)}`);
        } catch (e: any) {
            console.error(`Error fetching Grok status: ${e.message}`);
        }
    }
}

checkBatches().catch(console.error);
