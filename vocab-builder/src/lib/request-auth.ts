import 'server-only';
import { getAuthFromRequest } from '@/lib/appwrite/auth-admin';
import { publicEnv } from '@/lib/env/public';
import { isProductionEnv } from '@/lib/env/server';

type RequestAuthOptions = {
    allowHeaderFallback?: boolean;
};

function canUseHeaderFallback(options?: RequestAuthOptions): boolean {
    if (options?.allowHeaderFallback !== undefined) {
        return options.allowHeaderFallback;
    }

    return !isProductionEnv() && publicEnv.devBypassAuth;
}

export async function getRequestUser(
    request: Request,
    options?: RequestAuthOptions
): Promise<{
    userId: string;
    userEmail: string;
} | null> {
    const authUser = await getAuthFromRequest(request);
    if (authUser) {
        return authUser;
    }

    if (!canUseHeaderFallback(options)) {
        return null;
    }

    const userId = request.headers.get('x-user-id');
    if (!userId) {
        return null;
    }

    return {
        userId,
        userEmail: request.headers.get('x-user-email') || '',
    };
}

export async function requireRequestUser(
    request: Request,
    options?: RequestAuthOptions
): Promise<{
    userId: string;
    userEmail: string;
}> {
    const authUser = await getRequestUser(request, options);
    if (!authUser) {
        throw new Error('Unauthorized');
    }
    return authUser;
}
