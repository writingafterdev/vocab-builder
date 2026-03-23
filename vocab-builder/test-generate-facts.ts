import { NextRequest } from 'next/server';
import { GET } from './src/app/api/cron/generate-facts/route';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function testFactGeneration() {
    console.log("Starting Fact Generation Test...");
    
    // Create a mock NextRequest
    const req = new NextRequest('http://localhost:3000/api/cron/generate-facts', {
        method: 'GET',
    });

    try {
        const response = await GET(req);
        
        if (!response) {
            console.error("No response returned from GET.");
            process.exit(1);
        }

        const data = await response.json();
        
        if (response.ok) {
            console.log("\n✅ SUCCESS! Generated Facts:");
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.error("\n❌ ERROR! Request failed:");
            console.error(data);
        }
    } catch (e) {
        console.error("Exception thrown during test:", e);
    }
}

testFactGeneration().then(() => {
    // Force exit to ensure cleanup
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});
