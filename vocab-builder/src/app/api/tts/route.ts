import { NextRequest, NextResponse } from 'next/server';
import { callGrokTTS } from '@/lib/grok-tts';

/**
 * Generate TTS audio using Grok TTS
 * Supports returning direct MP3 audio
 */

// Grok TTS voice options
const VOICE_MAP: Record<string, 'eve' | 'ara' | 'rex' | 'sal' | 'leo'> = {
    'female_casual': 'eve',      // Upbeat, energetic
    'male_casual': 'rex',        // Conversational
    'female_professional': 'ara',// Warm, professional
    'male_professional': 'leo',  // Authoritative
    'female_bright': 'eve',
    'male_deep': 'leo',
    'default': 'eve',
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
        console.log('[TTS] Request body (Grok):', JSON.stringify(body).substring(0, 200));

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

async function generateSingleTTS(req: TTSRequest): Promise<NextResponse> {
    const voiceId = VOICE_MAP[req.voice || 'default'] || VOICE_MAP.default;

    const result = await callGrokTTS(req.text, { voiceId });

    console.log('[Grok TTS] Generated MP3, size:', result.audio.length);

    // Convert to Uint8Array for NextResponse compatibility
    const audioArray = new Uint8Array(result.audio);

    return new NextResponse(audioArray, {
        headers: {
            'Content-Type': 'audio/mpeg',
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

        const voiceId = speakerVoices[message.speakerName] as 'eve' | 'ara' | 'rex' | 'sal' | 'leo';
        const result = await callGrokTTS(message.text, { voiceId });

        audioSegments.push({
            id: message.id,
            base64: result.audio.toString('base64'),
            mimeType: result.mimeType,
        });
    }

    return NextResponse.json({
        success: true,
        segments: audioSegments,
        speakerVoices,
    });
}
