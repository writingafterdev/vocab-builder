import 'server-only';
import { serverEnv } from '@/lib/env/server';
import { getRequestUser } from '@/lib/request-auth';

function normalizeEmail(email: string | null | undefined): string {
    return (email || '').trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
    const normalized = normalizeEmail(email);
    return normalized.length > 0 && serverEnv.adminEmails.includes(normalized);
}

export async function getAdminRequestContext(request: Request): Promise<{
    userId: string | null;
    userEmail: string;
} | null> {
    const authUser = await getRequestUser(request, { allowHeaderFallback: true });
    const email = normalizeEmail(authUser?.userEmail || request.headers.get('x-user-email'));

    if (!isAdminEmail(email)) {
        return null;
    }

    return {
        userId: authUser?.userId || null,
        userEmail: email,
    };
}

export async function requireAdminRequest(request: Request): Promise<{
    userId: string | null;
    userEmail: string;
}> {
    const admin = await getAdminRequestContext(request);
    if (!admin) {
        throw new Error('Unauthorized');
    }

    return admin;
}
