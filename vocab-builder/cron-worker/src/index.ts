/**
 * Vocab Builder Cron Worker
 * 
 * This scheduled worker orchestrates daily tasks:
 * 1. Import new articles from configured RSS/Reddit sources
 * 2. Process each imported article through the AI pipeline (one at a time)
 * 3. Pre-generate audio for tomorrow's listening exercises
 */

export interface Env {
    APP_URL: string;
    CRON_SECRET: string;
}

/** Call an API endpoint with CRON_SECRET auth */
async function callEndpoint(
    url: string,
    cronSecret: string,
    method: 'POST' | 'GET' = 'POST'
): Promise<{ ok: boolean; data: any }> {
    try {
        console.log(`[Cron] → ${method} ${url}`);

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${cronSecret}`,
                'Content-Type': 'application/json',
            },
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { raw: responseText };
        }

        if (response.ok) {
            console.log(`[Cron] ✓ ${response.status}`);
        } else {
            console.error(`[Cron] ✗ ${response.status}: ${responseText.slice(0, 200)}`);
        }

        return { ok: response.ok, data };
    } catch (error) {
        console.error(`[Cron] Request failed:`, error);
        return { ok: false, data: { error: String(error) } };
    }
}

/** Small delay between API calls */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    /**
     * Scheduled handler — runs on cron trigger (daily 5AM ICT / 10PM UTC)
     */
    async scheduled(
        event: ScheduledController,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log(`[Cron] ═══ Daily job triggered at ${new Date(event.scheduledTime).toISOString()} ═══`);
        console.log(`[Cron] Cron pattern: ${event.cron}`);

        const appUrl = env.APP_URL;
        const cronSecret = env.CRON_SECRET;

        if (!appUrl || !cronSecret) {
            console.error('[Cron] Missing APP_URL or CRON_SECRET environment variables');
            return;
        }

        // ━━━ Phase 1: Import articles ━━━
        console.log('[Cron] ── Phase 1: Importing articles ──');

        const importResult = await callEndpoint(
            `${appUrl}/api/cron/daily-import`,
            cronSecret
        );

        if (!importResult.ok) {
            console.error('[Cron] Import phase failed. Skipping processing.');
            // Still try audio pre-generation even if import failed
        } else {
            const imported = importResult.data?.imported || 0;
            console.log(`[Cron] Imported ${imported} new articles`);

            // ━━━ Phase 2: Process articles one-by-one ━━━
            if (imported > 0) {
                console.log('[Cron] ── Phase 2: Processing articles ──');

                let remaining = imported;
                let processed = 0;
                const maxIterations = imported + 5; // safety limit

                while (remaining > 0 && processed < maxIterations) {
                    const processResult = await callEndpoint(
                        `${appUrl}/api/cron/process-next`,
                        cronSecret
                    );

                    if (!processResult.ok) {
                        console.error(`[Cron] Process attempt ${processed + 1} failed.`);
                        break;
                    }

                    remaining = processResult.data?.remaining || 0;
                    processed++;

                    const step = processResult.data?.processed;
                    if (step) {
                        console.log(`[Cron] Processed ${processed}: "${step.title?.slice(0, 50)}..." (${remaining} remaining)`);
                    }

                    // Small delay between processing to avoid rate limits
                    if (remaining > 0) {
                        await sleep(3000);
                    }
                }

                console.log(`[Cron] Processing complete. ${processed} articles processed.`);
            }
        }

        // ━━━ Phase 3: Pre-generate audio for tomorrow ━━━
        console.log('[Cron] ── Phase 3: Pre-generating audio ──');

        const audioResult = await callEndpoint(
            `${appUrl}/api/cron/pre-generate-audio`,
            cronSecret
        );

        if (audioResult.ok) {
            console.log(`[Cron] Audio pre-generation complete`);
        }

        console.log('[Cron] ═══ Daily job finished ═══');
    },

    /**
     * HTTP handler for manual testing
     */
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/health') {
            return new Response(JSON.stringify({
                status: 'ok',
                timestamp: new Date().toISOString(),
                jobs: ['daily-import', 'process-articles', 'pre-generate-audio'],
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (url.pathname === '/run') {
            const scheduledEvent = {
                scheduledTime: Date.now(),
                cron: 'manual',
                noRetry: () => { },
            } as ScheduledController;

            // Run in background so we can return immediately
            const handler = this.scheduled?.bind(this);
            if (handler) {
                ctx.waitUntil(Promise.resolve(handler(scheduledEvent, env, ctx)));
            }

            return new Response(JSON.stringify({
                message: 'Daily job triggered manually. Check logs for progress.',
                timestamp: new Date().toISOString(),
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(
            'Vocab Cron Worker\n\nEndpoints:\n- GET /health\n- GET /run (trigger manually)',
            { status: 200 }
        );
    },
} satisfies ExportedHandler<Env>;
