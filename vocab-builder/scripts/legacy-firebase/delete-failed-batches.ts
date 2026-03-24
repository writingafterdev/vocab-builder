import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { queryCollection, deleteDocument } from '../src/lib/firestore-rest';

async function run() {
    const jobs = await queryCollection('batchJobs');
    let deleted = 0;
    for (const job of jobs) {
        if (job.status === 'failed') {
            console.log(`Deleting failed job: ${job.id}`);
            await deleteDocument('batchJobs', job.id as string);
            deleted++;
        }
    }
    console.log(`Deleted ${deleted} broken batch jobs.`);
}
run().catch(console.error);
