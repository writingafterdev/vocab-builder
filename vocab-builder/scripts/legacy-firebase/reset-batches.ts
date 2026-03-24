import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, updateDocument } from '../src/lib/firestore-rest';

async function resetFailedBatches() {
    console.log('Fetching failed batch jobs from Firestore...');
    const failedJobs = await runQuery('batchJobs', [
        { field: 'status', op: 'EQUAL', value: 'failed' }
    ], 20);

    console.log(`Found ${failedJobs.length} failed jobs.`);

    for (const job of failedJobs) {
        console.log(`Resetting job ${job.id} (${job.type})...`);
        await updateDocument('batchJobs', job.id as string, { status: 'submitted' });
    }
    
    console.log('Done.');
}

resetFailedBatches().catch(console.error);
