import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { queryCollection } from '../src/lib/firestore-rest';
async function run() {
    const jobs = await queryCollection('batchJobs');
    // Sort manually
    jobs.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    let printed = 0;
    for (const job of jobs) {
        if (job.status === 'failed') {
            console.log(`Job: ${job.id} | Type: ${job.type} | Created: ${job.createdAt} | Error: ${job.error}`);
            printed++;
            if (printed >= 10) break;
        }
    }
}
run().catch(console.error);
