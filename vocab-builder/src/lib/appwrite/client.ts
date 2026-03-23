import { Client, Account, Databases, Storage } from 'appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Default DB ID export for frontend queries if needed
export const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'main';

export default client;
