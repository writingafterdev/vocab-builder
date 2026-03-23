import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { POST } from '../src/app/api/cron/collect-batch/route';
import { NextRequest } from 'next/server';

async function runCollector() {
    console.log('Running batch collector locally...');
    
    // Create a mock NextRequest
    const req = new NextRequest('http://localhost:3000/api/cron/collect-batch', {
        method: 'POST',
        headers: {
            'x-user-email': 'admin@system.local' // Bypass auth
        }
    });

    const res = await POST(req);
    const data = await res.json();
    console.log('Collector Response:', JSON.stringify(data, null, 2));
}

runCollector().catch(console.error);
