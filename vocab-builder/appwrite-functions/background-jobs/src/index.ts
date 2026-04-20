import { runGenerateFactsLogic } from '@/app/api/cron/generate-facts/logic';

/**
 * Appwrite Function Entrypoint for Background Jobs
 *
 * Actions:
 *   - generate_facts  → Generate random facts via Grok
 */
export default async ({ req, res, log, error }: any) => {
    log('Appwrite Background Jobs Function triggered');

    let action = 'generate_facts';
    try {
        if (req.bodyRaw) {
            const body = JSON.parse(req.bodyRaw);
            if (body.action) action = body.action;
        } else if (typeof req.body === 'object' && req.body.action) {
            action = req.body.action;
        }
    } catch (e) {
        log('No payload parsed. Running generate_facts.');
    }

    try {
        switch (action) {
            case 'generate_facts':
            default: {
                log('Executing: generate_facts');
                const result = await runGenerateFactsLogic();
                log(`Generated ${result.generatedCount} facts.`);
                return res.json({ success: true, result });
            }
        }
    } catch (err: any) {
        error(`Job Failed [${action}]: ${err?.message || err}`);
        return res.json({ success: false, error: err?.message || 'Unknown Error' }, 500);
    }
};
