/**
 * Firebase Storage REST API helpers
 * Edge-compatible storage operations for Cloudflare Workers
 */

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.appspot.com`;

/**
 * Upload a file to Firebase Storage using REST API
 * Returns the public download URL
 * 
 * Note: For production, you'd want to use a service account token.
 * For now, we use public uploads with predefined ACLs.
 */
export async function uploadToFirebaseStorage(
    data: Uint8Array | string,
    path: string,
    contentType: string
): Promise<string | null> {
    if (!FIREBASE_PROJECT_ID) {
        console.error('Firebase project ID not configured');
        return null;
    }

    try {
        // Convert string to bytes if needed
        const bytes = typeof data === 'string'
            ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
            : data;

        // Convert to ArrayBuffer slice for Blob compatibility
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: contentType });

        // Upload to Firebase Storage REST API
        // Using the public upload endpoint
        const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'Content-Length': bytes.length.toString(),
            },
            body: blob,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Firebase Storage upload failed:', response.status, errorText);
            return null;
        }

        const result = await response.json();

        // Construct download URL
        // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
        const downloadToken = result.downloadTokens;
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${downloadToken ? `&token=${downloadToken}` : ''}`;

        return downloadUrl;
    } catch (error) {
        console.error('Firebase Storage upload error:', error);
        return null;
    }
}

/**
 * Generate a unique audio file path
 */
export function generateAudioPath(userId: string, type: 'exercise' | 'article', id: string): string {
    const timestamp = Date.now();
    return `audio/${type}/${userId}/${id}_${timestamp}.wav`;
}

/**
 * Delete a file from Firebase Storage
 */
export async function deleteFromFirebaseStorage(path: string): Promise<boolean> {
    if (!FIREBASE_PROJECT_ID) return false;

    try {
        const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}`;

        const response = await fetch(deleteUrl, { method: 'DELETE' });
        return response.ok;
    } catch {
        return false;
    }
}
