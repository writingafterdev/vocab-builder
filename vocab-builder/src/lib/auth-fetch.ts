/**
 * Authenticated fetch helper for making secure API calls
 * Automatically includes Firebase ID token in requests
 */
import { auth } from '@/lib/firebase';

/**
 * Make an authenticated API request
 * Automatically includes the Firebase ID token in the Authorization header
 */
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const user = auth?.currentUser;

    if (!user) {
        throw new Error('User not authenticated');
    }

    // Get fresh ID token
    const token = await user.getIdToken();

    // Merge headers with auth
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    return fetch(url, {
        ...options,
        headers,
    });
}

/**
 * Make an authenticated POST request
 */
export async function authPost<T = unknown>(
    url: string,
    body: unknown
): Promise<T> {
    const response = await authFetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Make an authenticated GET request
 */
export async function authGet<T = unknown>(url: string): Promise<T> {
    const response = await authFetch(url, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
}
