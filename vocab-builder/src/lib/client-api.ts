import type { AppUser } from '@/lib/auth-context';

export interface ClientAuthContext {
    userId?: string | null;
    getToken?: (() => Promise<string>) | null;
}

interface ClientApiFetchInit extends Omit<RequestInit, 'headers'> {
    auth?: ClientAuthContext;
    headers?: HeadersInit;
    json?: unknown;
}

let cachedJwt: string | null = null;
let cachedJwtExpiresAt = 0;

export function authFromUser(
    user?: Pick<AppUser, '$id' | 'getJwt'> | null
): ClientAuthContext {
    return {
        userId: user?.$id,
        getToken: user?.getJwt,
    };
}

export function authFromUserId(
    userId?: string | null,
    includeToken = false
): ClientAuthContext {
    return {
        userId,
        getToken: includeToken ? getClientJwt : undefined,
    };
}

export async function getClientJwt(): Promise<string> {
    if (cachedJwt && Date.now() < cachedJwtExpiresAt) {
        return cachedJwt;
    }

    const { account } = await import('@/lib/appwrite/client');
    const result = await account.createJWT();
    cachedJwt = result.jwt;
    cachedJwtExpiresAt = Date.now() + 14 * 60 * 1000;
    return result.jwt;
}

export async function buildClientHeaders(
    auth?: ClientAuthContext,
    headers?: HeadersInit
): Promise<Headers> {
    const resolvedHeaders = new Headers(headers);

    if (auth?.userId) {
        resolvedHeaders.set('x-user-id', auth.userId);
    }

    if (auth?.getToken) {
        try {
            const token = await auth.getToken();
            if (token) {
                resolvedHeaders.set('Authorization', `Bearer ${token}`);
            }
        } catch {
            // Some read-only requests can still proceed without a JWT.
        }
    }

    return resolvedHeaders;
}

export async function clientApiFetch(
    input: RequestInfo | URL,
    init: ClientApiFetchInit = {}
): Promise<Response> {
    const { auth, headers, json, ...requestInit } = init;
    const resolvedHeaders = await buildClientHeaders(auth, headers);

    if (json !== undefined && !resolvedHeaders.has('Content-Type')) {
        resolvedHeaders.set('Content-Type', 'application/json');
    }

    return fetch(input, {
        ...requestInit,
        headers: resolvedHeaders,
        body: json !== undefined ? JSON.stringify(json) : requestInit.body,
    });
}

export async function clientApiJson<T>(
    input: RequestInfo | URL,
    init: ClientApiFetchInit = {}
): Promise<T> {
    const response = await clientApiFetch(input, init);

    if (!response.ok) {
        let message = `Request failed: ${response.status}`;
        try {
            const data = await response.json();
            if (typeof data?.error === 'string') {
                message = data.error;
            }
        } catch {
            // Ignore parse failures and keep the generic message.
        }
        throw new Error(message);
    }

    return response.json() as Promise<T>;
}
