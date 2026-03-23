import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, queryCollection } from '../src/lib/firestore-rest';

async function checkTodayBatches() {
    console.log('--- Checking Batch Jobs ---');
    const recentJobs = await runQuery('batchJobs', [], 5);
    for (const job of recentJobs) {
        console.log(`Job: ${job.id} | Type: ${job.type} | Status: ${job.status} | Created: ${job.createdAt} | Success: ${job.successCount} | Fail: ${job.failCount}`);
    }

    console.log('\n--- Checking Feed Quizzes ---');
    const quizzes = await queryCollection('feedQuizzes');
    console.log(`Total Feed Quizzes: ${quizzes.length}`);
    for (const q of quizzes.slice(-5)) {
         console.log(`Quiz: ${q.id} | Date: ${q.date} | Questions: ${Array.isArray(q.questions) ? q.questions.length : 0}`);
    }
}

checkTodayBatches().catch(console.error);
