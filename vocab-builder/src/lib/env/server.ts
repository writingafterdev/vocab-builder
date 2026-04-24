import 'server-only';
import { publicEnv } from './public';

function getServerEnv(names: string[], fallback?: string): string {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }

    if (fallback !== undefined) {
        return fallback;
    }

    throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
}

function parseAdminEmails(raw: string): string[] {
    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

export const serverEnv = {
    nodeEnv: process.env.NODE_ENV || 'development',
    appwriteEndpoint: getServerEnv(['APPWRITE_ENDPOINT', 'NEXT_PUBLIC_APPWRITE_ENDPOINT'], publicEnv.appwriteEndpoint),
    appwriteProjectId: getServerEnv(['APPWRITE_PROJECT_ID', 'NEXT_PUBLIC_APPWRITE_PROJECT_ID'], publicEnv.appwriteProjectId),
    appwriteDatabaseId: getServerEnv(['APPWRITE_DATABASE_ID', 'NEXT_PUBLIC_APPWRITE_DATABASE_ID'], publicEnv.appwriteDatabaseId),
    appwriteApiKey: getServerEnv(['APPWRITE_API_KEY']),
    cronSecret: process.env.CRON_SECRET?.trim() || '',
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS || ''),
} as const;

export function isProductionEnv(): boolean {
    return serverEnv.nodeEnv === 'production';
}
