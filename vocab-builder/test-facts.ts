import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { runGenerateFactsLogic } from './src/app/api/cron/generate-facts/logic';
(async () => {
    try {
        console.log('Testing generate facts...');
        const res = await runGenerateFactsLogic();
        console.log('Result:', JSON.stringify(res, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
})();
