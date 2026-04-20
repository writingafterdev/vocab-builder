'use client';

/**
 * OAuth Callback Handler — Appwrite v23+ token-based flow
 *
 * After createOAuth2Token(), Appwrite redirects here with:
 *   ?userId=xxx&secret=yyy
 *
 * We exchange those for a real session via account.createSession().
 * This works on all browsers/mobile — no cookie dependency.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { account } from '@/lib/appwrite/client';
import { Suspense } from 'react';

function CallbackInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function exchangeToken() {
            const userId = searchParams.get('userId');
            const secret = searchParams.get('secret');

            if (!userId || !secret) {
                // No token params — maybe landed here directly or old cookie flow
                // Try account.get() as a fallback
                try {
                    await account.get();
                    if (!cancelled) {
                        setStatus('success');
                        router.replace('/feed');
                    }
                } catch {
                    if (!cancelled) {
                        setError('No session found. Please try signing in again.');
                        setStatus('failed');
                        setTimeout(() => router.replace('/'), 2500);
                    }
                }
                return;
            }

            try {
                // Exchange the one-time token for a permanent session
                await account.createSession(userId, secret);
                if (!cancelled) {
                    setStatus('success');
                    router.replace('/feed');
                }
            } catch (err: any) {
                console.error('[AuthCallback] createSession failed:', err);
                if (!cancelled) {
                    setError(err?.message || 'Sign-in failed. Please try again.');
                    setStatus('failed');
                    setTimeout(() => router.replace('/'), 2500);
                }
            }
        }

        exchangeToken();
        return () => { cancelled = true; };
    }, [router, searchParams]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-6">
            {status === 'failed' ? (
                <p className="text-red-500 text-sm text-center px-8">{error || 'Sign-in failed. Redirecting…'}</p>
            ) : (
                <>
                    <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
                    <p className="text-neutral-400 text-xs uppercase tracking-widest">Signing in…</p>
                </>
            )}
        </div>
    );
}

// Wrap in Suspense because useSearchParams() requires it in App Router
export default function AuthCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
            </div>
        }>
            <CallbackInner />
        </Suspense>
    );
}
