'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Hook to detect online/offline status and show toasts.
 * Tracks navigator.onLine and listens for online/offline events.
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            toast.success('Back online', { duration: 2000 });
        };

        const handleOffline = () => {
            setIsOnline(false);
            toast.error('You are offline', {
                description: 'Some features may not work until you reconnect.',
                duration: 5000,
            });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}
