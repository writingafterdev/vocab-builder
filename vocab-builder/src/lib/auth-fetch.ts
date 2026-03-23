import { account } from '@/lib/appwrite/client';

/**
 * Make an authenticated API request
 * Automatically includes the Appwrite JWT explicitly generated
 */
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    let token = '';
    try {
        const jwtResponse = await account.createJWT();
        token = jwtResponse.jwt;
    } catch (error) {
        console.warn('Could not generate JWT. User may not be logged in.');
    }

    const headers = new Headers(options.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
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
