import { Client, Storage, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { serverEnv } from '@/lib/env/server';

const client = new Client()
    .setEndpoint(serverEnv.appwriteEndpoint)
    .setProject(serverEnv.appwriteProjectId)
    .setKey(serverEnv.appwriteApiKey);

const storage = new Storage(client);
const BUCKET_ID = 'main-storage';

export async function uploadToAppwriteStorage(buffer: Buffer, filename: string, _mimeType: string) {
    try {
        const fileId = ID.unique();
        const file = InputFile.fromBuffer(buffer, filename);
        const res = await storage.createFile(BUCKET_ID, fileId, file);
        
        // Get public URL
        const url = `${serverEnv.appwriteEndpoint}/storage/buckets/${BUCKET_ID}/files/${res.$id}/view?project=${serverEnv.appwriteProjectId}`;
        return url;
    } catch (e: any) {
        console.error('Appwrite Storage Upload Error:', e.message || e);
        return null;
    }
}

export async function deleteFromAppwriteStorage(fileUrlOrId: string): Promise<boolean> {
    try {
        let fileId = fileUrlOrId;
        
        // Extract fileId if a full URL was passed
        if (fileUrlOrId.includes('/files/')) {
            const matches = fileUrlOrId.match(/\/files\/([a-zA-Z0-9\-_]+)\/view/);
            if (matches && matches[1]) {
                fileId = matches[1];
            }
        }

        await storage.deleteFile(BUCKET_ID, fileId);
        return true;
    } catch (error) {
        console.error('Appwrite Storage delete error:', error);
        return false;
    }
}
