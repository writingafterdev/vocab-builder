'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { authFromUser, clientApiJson } from '@/lib/client-api';

type LaunchOptions = {
    replace?: boolean;
    fallbackHref?: string;
};

export function usePracticeLauncher() {
    const router = useRouter();
    const { user, loading } = useAuth();
    const [launching, setLaunching] = useState(false);

    const launchPractice = useCallback(async (options: LaunchOptions = {}) => {
        if (loading || launching) return;

        if (!user) {
            toast('Please log in to practice', { icon: '🔒' });
            router.push('/auth/login');
            return;
        }

        const navigate = options.replace ? router.replace : router.push;
        setLaunching(true);

        try {
            const data = await clientApiJson<{ sessionId: string }>('/api/practice/next-batch', {
                method: 'POST',
                auth: authFromUser(user),
                json: {},
            });
            navigate(`/practice/session/${data.sessionId}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to prepare practice session';
            if (message === 'No phrases due for review') {
                navigate(options.fallbackHref || '/practice');
                return;
            }
            console.error('Launch practice failed:', error);
            toast.error(message);
        } finally {
            setLaunching(false);
        }
    }, [launching, loading, router, user]);

    return {
        launching,
        launchPractice,
    };
}
