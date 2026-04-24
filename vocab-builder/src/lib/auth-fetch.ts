import { clientApiFetch, clientApiJson, getClientJwt } from '@/lib/client-api';

/**
 * Make an authenticated API request
 * Automatically includes the Appwrite JWT explicitly generated
 */
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    return clientApiFetch(url, {
        ...options,
        auth: { getToken: getClientJwt },
    });
}

/**
 * Make an authenticated POST request
 */
export async function authPost<T = unknown>(
    url: string,
    body: unknown
): Promise<T> {
    return clientApiJson<T>(url, {
        method: 'POST',
        auth: { getToken: getClientJwt },
        json: body,
    });
}

/**
 * Make an authenticated GET request
 */
export async function authGet<T = unknown>(url: string): Promise<T> {
    return clientApiJson<T>(url, {
        method: 'GET',
        auth: { getToken: getClientJwt },
    });
}
