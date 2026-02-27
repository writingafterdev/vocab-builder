import { NextRequest, NextResponse } from 'next/server';
import { fetchWithKeyRotation } from '@/lib/api-key-rotation';

/**
 * Generate TTS audio using Gemini 2.5 Flash TTS
 * Uses API key rotation for rate limit handling
 * Supports multiple voices for natural speech
 */

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

// Gemini TTS voice options (natural, expressive voices)
const VOICE_MAP: Record<string, string> = {
    'female_casual': 'Kore',      // Warm, friendly
    'male_casual': 'Puck',        // Casual, conversational
    'female_professional': 'Aoede', // Clear, professional
    'male_professional': 'Charon', // Deep, authoritative
    'female_bright': 'Leda',      // Bright, energetic
    'male_deep': 'Fenrir',        // Deep, resonant
    'default': 'Kore',
};

interface TTSRequest {
    text: string;
    voice?: string;
}

interface ConversationTTSRequest {
    messages: {
        id: string;
        speakerName: string;
        text: string;
        voiceType?: string;
    }[];
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log('[TTS] Request body:', JSON.stringify(body).substring(0, 200));

        // Single text TTS
        if (body.text && body.text.trim()) {
            return await generateSingleTTS(body as TTSRequest);
        }

        // Conversation TTS (multiple messages)
        if (body.messages) {
            return await generateConversationTTS(body as ConversationTTSRequest);
        }

        console.log('[TTS] Invalid request - no text or messages');
        return NextResponse.json({ error: 'Invalid request - text required' }, { status: 400 });

    } catch (error) {
        console.error('TTS error:', error);
        return NextResponse.json(
            { error: 'Failed to generate audio' },
            { status: 500 }
        );
    }
}

async function callGeminiTTS(text: string, voice: string): Promise<{ audio: string; mimeType: string }> {
    console.log('[Gemini TTS] Calling TTS with voice:', voice, 'text length:', text.length);
    console.log('[Gemini TTS] Model:', GEMINI_TTS_MODEL);

    const requestBody = {
        contents: [{
            parts: [{ text }]
        }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voice
                    }
                }
                // Note: Gemini returns raw PCM (16-bit, 24kHz, mono)
                // We convert to WAV on the server for browser compatibility
            }
        }
    };

    const apiUrl = (apiKey: string) => `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;
    console.log('[Gemini TTS] API URL template:', `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=***`);

    const response = await fetchWithKeyRotation(
        apiUrl,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }
    );

    console.log('[Gemini TTS] Response status:', response.status);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[Gemini TTS] API error:', response.status);
        console.error('[Gemini TTS] Error response:', errorText);
        throw new Error(`TTS generation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Log usage metadata if available
    if (data.usageMetadata) {
        console.log('[Gemini TTS] Token usage:', JSON.stringify(data.usageMetadata));
    }

    const audioContent = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!audioContent) {
        throw new Error('No audio in response');
    }

    console.log('[Gemini TTS] Audio mimeType:', audioContent.mimeType);

    return {
        audio: audioContent.data, // base64
        mimeType: audioContent.mimeType || 'audio/L16',
    };
}

/**
 * Convert raw PCM audio to WAV format
 * Gemini TTS returns 16-bit signed PCM at 24kHz mono
 */
function pcmToWav(pcmData: Buffer): Buffer {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;

    // Create WAV header (44 bytes)
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // subchunk size
    header.writeUInt16LE(1, 20);  // audio format (PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
}

async function generateSingleTTS(req: TTSRequest): Promise<NextResponse> {
    const voice = VOICE_MAP[req.voice || 'default'] || req.voice || VOICE_MAP.default;

    const result = await callGeminiTTS(req.text, voice);

    // Convert base64 PCM to WAV
    const pcmBuffer = Buffer.from(result.audio, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer);

    console.log('[Gemini TTS] Converted PCM to WAV, size:', wavBuffer.length);

    // Convert to Uint8Array for NextResponse compatibility
    const wavArray = new Uint8Array(wavBuffer);

    return new NextResponse(wavArray, {
        headers: {
            'Content-Type': 'audio/wav',
        },
    });
}

async function generateConversationTTS(req: ConversationTTSRequest): Promise<NextResponse> {
    const audioSegments: { id: string; base64: string; mimeType: string }[] = [];

    // Assign voices to speakers
    const speakerVoices: Record<string, string> = {};
    const voicePool = ['female_casual', 'male_casual', 'female_professional', 'male_professional'];
    let voiceIndex = 0;

    for (const message of req.messages) {
        if (!message.text.trim()) continue;

        // Assign consistent voice per speaker
        if (!speakerVoices[message.speakerName]) {
            const voiceType = message.voiceType || voicePool[voiceIndex % voicePool.length];
            speakerVoices[message.speakerName] = VOICE_MAP[voiceType] || VOICE_MAP.default;
            voiceIndex++;
        }

        const voice = speakerVoices[message.speakerName];
        const result = await callGeminiTTS(message.text, voice);

        audioSegments.push({
            id: message.id,
            base64: result.audio,
            mimeType: result.mimeType,
        });
    }

    return NextResponse.json({
        success: true,
        segments: audioSegments,
        speakerVoices,
    });
}
