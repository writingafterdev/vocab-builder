import { runGenerateFactsLogic } from '@/app/api/cron/generate-facts/logic';
import { preGenerateExercisePools } from '@/lib/exercise/shared-pool';

type AppwriteFunctionContext = {
    req: {
        bodyRaw?: string;
        body?: unknown;
    };
    res: {
        json: (body: unknown, status?: number) => unknown;
    };
    log: (message: string) => void;
    error: (message: string) => void;
};

/**
 * Appwrite Function Entrypoint for Background Jobs
 *
 * Actions:
 *   - generate_facts  → Generate random facts via Grok
 *   - pregenerate_exercise_pool → Warm Exercise V3 shared question pool
 *   - daily_sequence → Run scheduled production jobs
 */
const handler = async ({ req, res, log, error }: AppwriteFunctionContext) => {
    log('Appwrite Background Jobs Function triggered');

    let action = 'daily_sequence';
    try {
        if (req.bodyRaw) {
            const body = JSON.parse(req.bodyRaw);
            if (body.action) action = body.action;
        } else if (typeof req.body === 'object' && req.body !== null && 'action' in req.body) {
            const body = req.body as { action?: unknown };
            if (typeof body.action === 'string') action = body.action;
        }
    } catch {
        log('No payload parsed. Running daily_sequence.');
    }

    try {
        switch (action) {
            case 'pregenerate_exercise_pool': {
                log('Executing: pregenerate_exercise_pool');
                const result = await preGenerateExercisePools({
                    limit: 50,
                    includeProduction: true,
                });
                log(`Exercise pool prefill: generated ${result.generated}, skipped ${result.skipped}.`);
                return res.json({ success: true, result });
            }
            case 'daily_sequence': {
                log('Executing: daily_sequence');
                const exercisePool = await preGenerateExercisePools({
                    limit: 50,
                    includeProduction: true,
                });
                log(`Exercise pool prefill: generated ${exercisePool.generated}, skipped ${exercisePool.skipped}.`);

                const facts = await runGenerateFactsLogic();
                log(`Generated ${facts.generatedCount} facts.`);

                return res.json({
                    success: true,
                    result: {
                        exercisePool,
                        facts,
                    },
                });
            }
            case 'generate_facts':
            default: {
                log('Executing: generate_facts');
                const result = await runGenerateFactsLogic();
                log(`Generated ${result.generatedCount} facts.`);
                return res.json({ success: true, result });
            }
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err || 'Unknown Error');
        error(`Job Failed [${action}]: ${message}`);
        return res.json({ success: false, error: message }, 500);
    }
};

export default handler;
