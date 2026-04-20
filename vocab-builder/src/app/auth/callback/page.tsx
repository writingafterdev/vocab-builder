'use client';

/**
 * OAuth Callback Handler
 *
 * Appwrite redirects here after Google OAuth completes.
 * On mobile (Safari/iOS), the session cookie may not propagate
 * immediately after an OAuth redirect. We retry account.get()
 * up to 8 times with exponential backoff before giving up.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { account } from '@/lib/appwrite/client';
import { AppwriteException } from 'appwrite';

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 300;

export default function AuthCallbackPage() {
    const router = useRouter();
    const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function tryGetSession() {
            for (let i = 0; i < MAX_ATTEMPTS; i++) {
                if (cancelled) return;

                try {
                    await account.get();
                    // Session confirmed — go to the app
                    if (!cancelled) {
                        setStatus('success');
                        router.replace('/feed');
                    }
                    return;
                } catch (err: any) {
                    const is401 = err instanceof AppwriteException && err.code === 401;
                    if (!is401) {
                        // Unexpected error — give up
                        console.error('[AuthCallback] Unexpected error:', err);
                        break;
                    }
                    // Session not ready yet — wait and retry
                    const delay = BASE_DELAY_MS * Math.pow(1.8, i); // ~300ms, 540ms, 972ms…
                    setAttempt(i + 1);
                    await new Promise(res => setTimeout(res, delay));
                }
            }

            // All retries exhausted
            if (!cancelled) {
                setStatus('failed');
                // Redirect to landing page so user can try again
                setTimeout(() => router.replace('/'), 2000);
            }
        }

        tryGetSession();
        return () => { cancelled = true; };
    }, [router]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-6">
            {status === 'failed' ? (
                <>
                    <p className="text-neutral-500 text-sm">Login failed. Redirecting…</p>
                </>
            ) : (
                <>
                    {/* Spinner */}
                    <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
                    <p className="text-neutral-400 text-xs uppercase tracking-widest">
                        {attempt > 2 ? 'Almost there…' : 'Signing in…'}
                    </p>
                </>
            )}
        </div>
    );
}
