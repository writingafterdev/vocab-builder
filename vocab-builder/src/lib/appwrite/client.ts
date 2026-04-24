import { Client, Account, Databases, Storage } from 'appwrite';
import { publicEnv } from '@/lib/env/public';

const client = new Client()
    .setEndpoint(publicEnv.appwriteEndpoint)
    .setProject(publicEnv.appwriteProjectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Default DB ID export for frontend queries if needed
export const DB_ID = publicEnv.appwriteDatabaseId;

export default client;
