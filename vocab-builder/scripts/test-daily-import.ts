// RUN WITH: npx tsx --env-file=.env.local scripts/test-daily-import.ts
import { POST } from '../src/app/api/cron/daily-import/route';
import { NextRequest } from 'next/server';

async function run() {
    const req = new NextRequest('http://localhost:3000/api/cron/daily-import', {
        method: 'POST',
        headers: {
            'x-user-email': 'ducanhcontactonfb@gmail.com'
        }
    });

    try {
        const res = await POST(req);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

run();
