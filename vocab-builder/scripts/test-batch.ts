import fs from 'fs';
import path from 'path';

// Load .env.local manually
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
      const match = line.match(/^([^#]+?)=(.+)/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // remove surrounding quotes
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
} catch (e) {}

import { runDailyImportLogic } from '../src/app/api/cron/daily-import/logic';
import { runCollectBatchLogic } from '../src/app/api/cron/collect-batch/logic';

async function main() {
    console.log('--- STARTING DAILY IMPORT (Submitting to Grok) ---');
    try {
        const importResult = await runDailyImportLogic();
        console.log('Daily Import Result:', JSON.stringify(importResult, null, 2));

        console.log('\n--- STARTING COLLECT BATCH (Checking status) ---');
        const collectResult = await runCollectBatchLogic();
        console.log('Collect Batch Result:', JSON.stringify(collectResult, null, 2));

        if (collectResult.results?.some((r: any) => r.status === 'still_processing')) {
            console.log('\nNOTE: Batch is still processing on Grok. Run this script again in 1-2 minutes to collect the results!');
        }
    } catch (e) {
        console.error('Error during test:', e);
    }
}

main().then(() => process.exit(0));
