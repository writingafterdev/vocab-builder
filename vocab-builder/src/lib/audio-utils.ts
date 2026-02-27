/**
 * Audio utilities for pre-generating and storing exercise audio
 * Uses Firebase Storage for persistent audio file storage
 */

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';

// Get Firebase Storage instance
function getStorageInstance() {
    try {
        const app = getApp();
        return getStorage(app);
    } catch {
        return null;
    }
}

/**
 * Convert PCM audio data to WAV format
 * Gemini TTS returns raw PCM (L16) which browsers can't play directly
 */
export function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000): Uint8Array {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const headerSize = 44;

    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Copy PCM data
    const wavArray = new Uint8Array(buffer);
    wavArray.set(pcmData, headerSize);

    return wavArray;
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

/**
 * Upload audio to Firebase Storage and return download URL
 * @param audioData - Audio file data (WAV or MP3)
 * @param fileName - File name without extension
 * @param mimeType - MIME type of audio
 */
export async function uploadAudioToStorage(
    audioData: Uint8Array,
    fileName: string,
    mimeType: string = 'audio/wav'
): Promise<string | null> {
    const storage = getStorageInstance();
    if (!storage) {
        console.error('Firebase Storage not initialized');
        return null;
    }

    try {
        const extension = mimeType.includes('mp3') ? 'mp3' : 'wav';
        const fullPath = `audio/exercises/${fileName}.${extension}`;
        const storageRef = ref(storage, fullPath);

        await uploadBytes(storageRef, audioData, {
            contentType: mimeType,
        });

        const downloadUrl = await getDownloadURL(storageRef);
        return downloadUrl;
    } catch (error) {
        console.error('Failed to upload audio:', error);
        return null;
    }
}

/**
 * Generate a unique audio file name based on content
 */
export function generateAudioFileName(userId: string, phraseIds: string[]): string {
    const hash = phraseIds.sort().join('-').slice(0, 20);
    const timestamp = Date.now();
    return `${userId}_${hash}_${timestamp}`;
}

// ============================================
// Speaking Feedback Audio Utilities
// ============================================

/**
 * Convert an audio blob to base64 string (client-side)
 */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            // Remove data URL prefix (e.g., "data:audio/webm;base64,")
            const base64Data = base64.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Compress audio by reducing sample rate (client-side)
 * Target: 16kHz mono for optimal size/quality balance
 */
export async function compressAudio(blob: Blob): Promise<Blob> {
    const audioContext = new AudioContext({ sampleRate: 16000 });

    try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Create offline context for resampling
        const offlineContext = new OfflineAudioContext(
            1, // mono
            audioBuffer.duration * 16000,
            16000
        );

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();

        const renderedBuffer = await offlineContext.startRendering();
        const wavBlob = audioBufferToWav(renderedBuffer);

        return wavBlob;
    } finally {
        audioContext.close();
    }
}

/**
 * Convert AudioBuffer to WAV blob (client-side)
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const data = buffer.getChannelData(0);
    const samples = data.length;
    const dataSize = samples * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < samples; i++) {
        const sample = Math.max(-1, Math.min(1, data[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Get audio duration from blob (client-side)
 */
export async function getAudioDuration(blob: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.onloadedmetadata = () => {
            URL.revokeObjectURL(audio.src);
            resolve(audio.duration);
        };
        audio.onerror = reject;
        audio.src = URL.createObjectURL(blob);
    });
}

/**
 * Maximum audio duration for speaking feedback (60 seconds)
 */
export const MAX_AUDIO_DURATION = 60;

/**
 * Validate audio duration
 */
export async function validateAudioDuration(blob: Blob): Promise<{ valid: boolean; duration: number }> {
    const duration = await getAudioDuration(blob);
    return {
        valid: duration <= MAX_AUDIO_DURATION,
        duration
    };
}

/**
 * Prepare audio for API submission (client-side)
 * Compresses and converts to base64 for Gemini analysis
 */
export async function prepareAudioForAnalysis(blob: Blob): Promise<{
    audioBase64: string;
    mimeType: string;
    duration: number;
}> {
    // Validate duration
    const { valid, duration } = await validateAudioDuration(blob);
    if (!valid) {
        throw new Error(`Audio exceeds maximum duration of ${MAX_AUDIO_DURATION} seconds`);
    }

    // Compress to 16kHz mono WAV
    const compressedBlob = await compressAudio(blob);

    // Convert to base64
    const audioBase64 = await blobToBase64(compressedBlob);

    return {
        audioBase64,
        mimeType: 'audio/wav',
        duration
    };
}
