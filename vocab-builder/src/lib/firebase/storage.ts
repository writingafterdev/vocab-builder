import { storage } from '@/lib/appwrite/client';
import { ID } from 'appwrite';

const BUCKET_ID = 'main-storage';

export function getStorage(app?: any) {
    return { isAppwriteMock: true };
}

export function ref(storageMock: any, path: string) {
    return { 
        bucketId: BUCKET_ID, 
        path: path 
    };
}

export async function uploadBytes(storageRef: any, data: Blob | Uint8Array | ArrayBuffer, metadata?: any) {
    const fileId = ID.unique();
    let file: File;
    
    // In browser environments or Node.js polyfills, convert to File
    if (data instanceof Blob) {
        file = new File([data as any], fileId, { type: metadata?.contentType || data.type || 'application/octet-stream' });
    } else {
        file = new File([data as any], fileId, { type: metadata?.contentType || 'application/octet-stream' });
    }

    const response = await storage.createFile(storageRef.bucketId, fileId, file);
    
    // Mutate the ref so getDownloadURL can extract the real fileId
    storageRef.fileId = response.$id;
    
    return {
        ref: storageRef,
        metadata: response
    };
}

export async function getDownloadURL(storageRef: any) {
    if (!storageRef.fileId) {
        throw new Error('Missing fileId in storageRef. Appwrite polyfill requires uploadBytes to be called first to generate the fileId.');
    }
    const resultUrl = storage.getFileView(storageRef.bucketId, storageRef.fileId);
    return resultUrl.toString();
}
