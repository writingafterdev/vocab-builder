/**
 * Vocab Builder Cron Worker
 * 
 * This scheduled worker triggers the audio pre-generation endpoint
 * daily to prepare listening exercises for the next day.
 */

export interface Env {
    APP_URL: string;
    CRON_SECRET: string;
}

export default {
    /**
     * Scheduled handler - runs on cron trigger
     */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log(`[Cron] Triggered at ${new Date(event.scheduledTime).toISOString()}`);
        console.log(`[Cron] Cron pattern: ${event.cron}`);

        const appUrl = env.APP_URL;
        const cronSecret = env.CRON_SECRET;

        if (!appUrl || !cronSecret) {
            console.error('[Cron] Missing APP_URL or CRON_SECRET environment variables');
            return;
        }

        const endpoint = `${appUrl}/api/cron/pre-generate-audio`;

        try {
            console.log(`[Cron] Calling ${endpoint}`);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cronSecret}`,
                    'Content-Type': 'application/json',
                },
            });

            const responseText = await response.text();

            if (response.ok) {
                console.log(`[Cron] Success: ${response.status}`);
                console.log(`[Cron] Response: ${responseText}`);
            } else {
                console.error(`[Cron] Failed: ${response.status}`);
                console.error(`[Cron] Error: ${responseText}`);
            }
        } catch (error) {
            console.error('[Cron] Request failed:', error);
        }
    },

    /**
     * Optional fetch handler for manual testing via HTTP
     * GET /run - manually trigger the cron job
     * GET /health - health check
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
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (url.pathname === '/run') {
            // Manual trigger - call the scheduled handler
            const scheduledEvent = {
                scheduledTime: Date.now(),
                cron: 'manual',
            } as ScheduledEvent;

            await this.scheduled(scheduledEvent, env, ctx);

            return new Response(JSON.stringify({
                message: 'Cron job triggered manually',
                timestamp: new Date().toISOString(),
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response('Vocab Cron Worker\n\nEndpoints:\n- GET /health\n- GET /run', {
            status: 200,
        });
    },
} satisfies ExportedHandler<Env>;
