import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from '@/lib/api-key-rotation';
import { uploadToAppwriteStorage } from '@/lib/appwrite/storage';
import { getDocument, updateDocument } from '@/lib/appwrite/database';
import type { SpeakingChunk } from '@/types';
import { requireRequestUser } from '@/lib/request-auth';

/**
 * Speaking Chunks API - Manages shared TTS cache for Read & Speak mode
 * 
 * GET: Fetch or generate chunks for an article
 * POST: Generate and cache TTS audio for a specific chunk
 */

// Chunking logic (moved from client-side)
function splitIntoChunks(content: string): string[] {
    const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const paragraphs = cleanContent.split(/\n\n+/).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
        const words = para.split(/\s+/);
        const wordCount = words.length;
        const currentWords = currentChunk.split(/\s+/).filter(w => w.length > 0).length;

        if (wordCount < 30 && currentWords + wordCount < 80) {
            currentChunk = currentChunk ? `${currentChunk} ${para}` : para;
        } else if (wordCount <= 80) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = para;
        } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = '';

            const sentences = para.split(/(?<=[.!?])\s+/);
            let sentenceChunk = '';

            for (const sentence of sentences) {
                const sentenceWords = sentence.split(/\s+/).length;
                const chunkWords = sentenceChunk.split(/\s+/).filter(w => w.length > 0).length;

                if (chunkWords + sentenceWords <= 80) {
                    sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
                } else {
                    if (sentenceChunk) chunks.push(sentenceChunk.trim());
                    sentenceChunk = sentence;
                }
            }
            if (sentenceChunk) currentChunk = sentenceChunk;
        }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks.filter(c => c.split(/\s+/).length >= 5);
}

// Convert PCM to WAV
function pcmToWav(pcmData: Uint8Array, sampleRate = 24000): Uint8Array {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const wavHeaderSize = 44;
    const dataSize = pcmData.length;
    const fileSize = wavHeaderSize + dataSize - 8;

    const buffer = new ArrayBuffer(wavHeaderSize + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const wavData = new Uint8Array(buffer);
    wavData.set(pcmData, wavHeaderSize);
    return wavData;
}

// GET: Fetch or generate chunks for article
export async function GET(request: NextRequest) {
    try {
        await requireRequestUser(request, { allowHeaderFallback: true });

        const { searchParams } = new URL(request.url);
        const articleId = searchParams.get('articleId');

        if (!articleId) {
            return NextResponse.json({ error: 'Missing articleId' }, { status: 400 });
        }

        // Get post from Firestore using REST API
        const postData = await getDocument('posts', articleId);

        if (!postData) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        // Check if chunks already exist
        const existingChunks = postData.speakingChunks as SpeakingChunk[] | undefined;
        if (existingChunks && existingChunks.length > 0) {
            console.log(`[Speaking Chunks] Returning ${existingChunks.length} cached chunks`);
            return NextResponse.json({
                success: true,
                chunks: existingChunks,
                cached: true
            });
        }

        // Generate chunks from article content
        const content = (postData.postContent as string) || '';
        const chunkTexts = splitIntoChunks(content);

        const chunks: SpeakingChunk[] = chunkTexts.map(text => ({
            text,
            audioUrl: undefined,
            generatedAt: undefined
        }));

        // Save chunks to Firestore
        await updateDocument('posts', articleId, { speakingChunks: chunks });
        console.log(`[Speaking Chunks] Generated ${chunks.length} new chunks for article ${articleId}`);

        return NextResponse.json({
            success: true,
            chunks,
            cached: false
        });

    } catch (error) {
        console.error('[Speaking Chunks] GET error:', error);
        return NextResponse.json(
            { error: 'Failed to get chunks', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// POST: Generate TTS for a specific chunk
export async function POST(request: NextRequest) {
    try {
        await requireRequestUser(request, { allowHeaderFallback: true });

        const body = await request.json();
        const { articleId, chunkIndex } = body;

        if (!articleId || chunkIndex === undefined) {
            return NextResponse.json({ error: 'Missing articleId or chunkIndex' }, { status: 400 });
        }

        // Get post from Firestore using REST API
        const postData = await getDocument('posts', articleId);

        if (!postData) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const chunks: SpeakingChunk[] = (postData.speakingChunks as SpeakingChunk[]) || [];

        if (chunkIndex >= chunks.length) {
            return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 });
        }

        const chunk = chunks[chunkIndex];

        // Check if audio already cached
        if (chunk.audioUrl) {
            console.log(`[Speaking Chunks] Returning cached audio for chunk ${chunkIndex}`);
            return NextResponse.json({
                success: true,
                audioUrl: chunk.audioUrl,
                cached: true
            });
        }

        // Generate TTS using Gemini
        const apiKey = getNextApiKey();
        if (!apiKey) {
            return NextResponse.json({ error: 'No API key available' }, { status: 503 });
        }

        const ai = new GoogleGenAI({ apiKey });
        console.log(`[Speaking Chunks] Generating TTS for chunk ${chunkIndex}: "${chunk.text.slice(0, 50)}..."`);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ role: 'user', parts: [{ text: chunk.text }] }],
            config: {
                responseModalities: ['audio'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }
                    }
                }
            }
        });

        // Extract audio data
        const audioPart = response.candidates?.[0]?.content?.parts?.find(
            (p: any) => p.inlineData?.mimeType?.startsWith('audio/')
        );

        if (!audioPart?.inlineData?.data) {
            throw new Error('No audio data in response');
        }

        // Decode and convert to WAV
        const audioBytes = Uint8Array.from(atob(audioPart.inlineData.data), c => c.charCodeAt(0));
        const wavData = pcmToWav(audioBytes);

        // Upload to Appwrite Storage
        const storagePath = `tts_cache_${articleId}_${chunkIndex}.wav`;
        const buffer = Buffer.from(wavData);
        const audioUrl = await uploadToAppwriteStorage(buffer, storagePath, 'audio/wav');

        if (!audioUrl) {
            throw new Error('Failed to upload audio to storage');
        }

        // Update Firestore with cached URL
        chunks[chunkIndex] = {
            ...chunk,
            audioUrl,
            generatedAt: Date.now()
        };

        await updateDocument('posts', articleId, { speakingChunks: chunks });
        console.log(`[Speaking Chunks] Cached audio for chunk ${chunkIndex} at ${storagePath}`);

        return NextResponse.json({
            success: true,
            audioUrl,
            cached: false
        });

    } catch (error) {
        console.error('[Speaking Chunks] POST error:', error);
        return NextResponse.json(
            { error: 'Failed to generate audio', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
