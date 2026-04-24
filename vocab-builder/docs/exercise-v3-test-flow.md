# Exercise V3 Test Flow

## Automated Smoke Test
Run:

```bash
npm run test:exercise-v3
```

This suite checks:
- next practice batch creation from the shared pool
- V3 session loading and rejection of legacy passage sessions
- V3-only session listing
- feed quiz delivery from the shared pool
- feed attempt submission
- practice batch completion logging
- dashboard drill and immersive capability routes
- legacy exercise endpoint retirement

## Manual QA Flow
Use this after `npm run dev`:

1. Open `/feed`.
2. Scroll until a quiz card appears.
3. Answer a quiz card.
4. Confirm it advances and does not throw console or network errors.
5. Open `/practice`.
6. Confirm the page auto-redirects into a practice batch without a start button.
7. Answer several questions, including one free-write if available.
8. Finish the batch and confirm the completion screen appears.
9. Open `/dashboard`.
10. Confirm `Immersive Mode` eligibility and `weakness/drill` data load without route errors.
11. Open a known legacy session ID if you have one.
12. Confirm it returns a clear retired/unsupported response instead of rendering broken UI.

## Expected V3 Behavior
- Each question owns its own `context`.
- No shared anchor passage is required.
- Feed and Practice both consume from the shared question pool.
- Legacy `/api/user/*` exercise routes should return `410`.
