# Vocab Cron Worker

Cloudflare Scheduled Worker that triggers daily audio pre-generation for listening exercises.

## Setup

1. **Install dependencies:**
   ```bash
   cd cron-worker
   npm install
   ```

2. **Add secrets:**
   ```bash
   # Your deployed app URL
   npx wrangler secret put APP_URL
   # Enter: https://your-vocab-app.pages.dev

   # The same CRON_SECRET from your .env.local
   npx wrangler secret put CRON_SECRET
   ```

3. **Deploy:**
   ```bash
   npm run deploy
   ```

## Local Testing

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Trigger the cron manually:**
   ```bash
   npm run trigger
   # Or: curl 'http://localhost:8787/__scheduled?cron=*+*+*+*+*'
   ```

3. **Or use the /run endpoint:**
   ```bash
   curl http://localhost:8787/run
   ```

## Schedule

The worker runs daily at **10 PM UTC** (5 AM ICT).  
Edit `wrangler.toml` to change the schedule:

```toml
[triggers]
crons = ["0 22 * * *"]  # 10 PM UTC daily
```

### Common Cron Patterns

| Time | Cron |
|------|------|
| Midnight UTC | `0 0 * * *` |
| 6 AM UTC | `0 6 * * *` |
| Every 12 hours | `0 */12 * * *` |

## Monitoring

View logs in Cloudflare dashboard:
1. Go to Workers & Pages
2. Select `vocab-cron-worker`
3. Click "Logs" tab
