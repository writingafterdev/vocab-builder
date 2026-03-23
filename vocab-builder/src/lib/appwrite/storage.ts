import { Client, Storage, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string)
    .setKey(process.env.APPWRITE_API_KEY as string);

const storage = new Storage(client);
const BUCKET_ID = 'main-storage';

export async function uploadToAppwriteStorage(buffer: Buffer, filename: string, mimeType: string) {
    try {
        const fileId = ID.unique();
        const file = InputFile.fromBuffer(buffer, filename);
        const res = await storage.createFile(BUCKET_ID, fileId, file);
        
        // Get public URL
        const url = `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${res.$id}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`;
        return url;
    } catch (e: any) {
        console.error('Appwrite Storage Upload Error:', e.message || e);
        return null;
    }
}
