import { runDailyImportLogic } from '@/app/api/cron/daily-import/logic';
import { runProcessNextLogic } from '@/app/api/cron/process-next/logic';
import { runGenerateFactsLogic } from '@/app/api/cron/generate-facts/logic';
import { runCollectBatchLogic } from '@/app/api/cron/collect-batch/logic';
import { runTTSBatchLogic } from '@/app/api/cron/collect-batch/tts-batch-logic';

/**
 * Appwrite Function Entrypoint for Background Jobs
 * 
 * Invoked by Appwrite Cron or manual execution.
 * The `context` object provides req, res, log, and error functions.
 * 
 * Actions:
 *   - daily_import      → Import articles from RSS/Reddit + submit Grok batches
 *   - collect_batch     → Poll Grok batch results and save to DB
 *   - generate_tts      → Pre-generate Grok TTS audio for listening quizzes/sessions
 *   - process_next      → Process pending articles through AI pipeline (850s budget)
 *   - generate_facts    → Generate random facts via Grok
 *   - daily_sequence    → Run full daily pipeline (import → collect → tts → process → facts)
 */
export default async ({ req, res, log, error }: any) => {
    log('Appwrite Background Jobs Function triggered');
    
    let action = 'daily_sequence';
    try {
        if (req.bodyRaw) {
            const body = JSON.parse(req.bodyRaw);
            if (body.action) action = body.action;
        } else if (typeof req.body === 'object' && req.body.action) {
            action = req.body.action;
        }
    } catch (e) {
        log('No payload parsed. Running daily_sequence.');
    }

    try {
        switch (action) {
            case 'daily_import': {
                log('Executing: daily_import');
                const result = await runDailyImportLogic();
                return res.json({ success: true, result });
            }

            case 'collect_batch': {
                log('Executing: collect_batch');
                const result = await runCollectBatchLogic();
                return res.json({ success: true, result });
            }

            case 'generate_tts': {
                log('Executing: generate_tts');
                const result = await runTTSBatchLogic();
                return res.json({ success: true, result });
            }

            case 'process_next': {
                log('Executing: process_next');
                const result = await runProcessNextLogic(850_000);
                return res.json({ success: true, result });
            }

            case 'generate_facts': {
                log('Executing: generate_facts');
                const result = await runGenerateFactsLogic();
                return res.json({ success: true, result });
            }

            case 'daily_sequence':
            default: {
                log('Executing full daily sequence...');
                
                log('--- Step 1: Daily Import ---');
                const importResult = await runDailyImportLogic();
                log(`Imported ${importResult.imported} new articles.`);

                log('--- Step 2: Collect Batch Results ---');
                const collectResult = await runCollectBatchLogic();
                log(`Collected ${collectResult.processed} batch jobs.`);

                log('--- Step 3: Pre-Generate TTS Audio ---');
                const ttsResult = await runTTSBatchLogic();
                log(`TTS: ${ttsResult.feedQuizAudio} quiz + ${ttsResult.sessionAudio} session audio files.`);

                log('--- Step 4: Process All Pending ---');
                const processResult = await runProcessNextLogic(600_000);
                log(`Processed ${processResult.processed} articles.`);

                log('--- Step 5: Generate Facts ---');
                const factsResult = await runGenerateFactsLogic();
                log(`Generated ${factsResult.generatedCount} facts.`);

                return res.json({ 
                    success: true, 
                    message: 'Full daily sequence completed in Appwrite!',
                    details: { importResult, collectResult, ttsResult, processResult, factsResult }
                });
            }
        }
    } catch (err: any) {
        error(`Job Failed [${action}]: ${err?.message || err}`);
        return res.json({ success: false, error: err?.message || 'Unknown Error' }, 500);
    }
};
