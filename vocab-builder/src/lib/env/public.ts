const DEFAULT_APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const DEFAULT_APPWRITE_DATABASE_ID = 'main';
const DEFAULT_APPWRITE_PROJECT_ID = '697698eb000b03b2cc1a';

function getPublicEnv(name: string, fallback?: string): string {
    const value = process.env[name]?.trim();
    if (value) {
        return value;
    }

    if (fallback !== undefined) {
        return fallback;
    }

    throw new Error(`Missing required environment variable: ${name}`);
}

export const publicEnv = {
    appwriteEndpoint: getPublicEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT', DEFAULT_APPWRITE_ENDPOINT),
    appwriteProjectId: getPublicEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID', DEFAULT_APPWRITE_PROJECT_ID),
    appwriteDatabaseId: getPublicEnv('NEXT_PUBLIC_APPWRITE_DATABASE_ID', DEFAULT_APPWRITE_DATABASE_ID),
    devBypassAuth: process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true',
} as const;
