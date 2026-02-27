/**
 * Edge TTS Utility
 * 
 * Uses Microsoft Edge's free TTS service to generate high-quality MP3 audio.
 * This is the primary TTS option as it's free and returns MP3 directly.
 * 
 * Based on the edge-tts protocol which communicates via WebSocket.
 */

// Edge TTS WebSocket endpoint
const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// Voice options - these are high-quality neural voices
export const EDGE_VOICES = {
    // English voices
    'en-US-AriaNeural': 'en-US-AriaNeural',    // Female, natural
    'en-US-GuyNeural': 'en-US-GuyNeural',      // Male, natural
    'en-US-JennyNeural': 'en-US-JennyNeural',  // Female, casual
    'en-GB-SoniaNeural': 'en-GB-SoniaNeural',  // British female
    'en-AU-NatashaNeural': 'en-AU-NatashaNeural', // Australian female
} as const;

export type EdgeVoice = keyof typeof EDGE_VOICES;

interface EdgeTTSOptions {
    voice?: EdgeVoice;
    rate?: string;   // e.g., '+0%', '-10%', '+20%'
    pitch?: string;  // e.g., '+0Hz', '-5Hz', '+10Hz'
    volume?: string; // e.g., '+0%', '-20%', '+50%'
}

/**
 * Generate a unique request ID for Edge TTS
 */
function generateRequestId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Create the SSML (Speech Synthesis Markup Language) for Edge TTS
 */
function createSSML(text: string, options: EdgeTTSOptions): string {
    const voice = options.voice || 'en-US-AriaNeural';
    const rate = options.rate || '+0%';
    const pitch = options.pitch || '+0Hz';
    const volume = options.volume || '+0%';

    // Escape special XML characters
    const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice name="${voice}">
      <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
        ${escapedText}
      </prosody>
    </voice>
  </speak>`;
}

/**
 * Generate MP3 audio using Edge TTS
 * Returns the MP3 audio as a Uint8Array
 */
export async function generateEdgeTTS(
    text: string,
    options: EdgeTTSOptions = {}
): Promise<Uint8Array> {
    const requestId = generateRequestId().replace(/-/g, '');
    const timestamp = new Date().toISOString();

    // Build the WebSocket URL with required parameters
    const wsUrl = `${EDGE_TTS_URL}?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;

    return new Promise((resolve, reject) => {
        const audioChunks: Uint8Array[] = [];
        let ws: WebSocket;

        try {
            ws = new WebSocket(wsUrl);
        } catch (error) {
            reject(new Error(`Failed to create WebSocket: ${error}`));
            return;
        }

        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Edge TTS timeout after 30 seconds'));
        }, 30000);

        ws.onopen = () => {
            // Send configuration message
            const configMessage = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`;
            ws.send(configMessage);

            // Send SSML message
            const ssml = createSSML(text, options);
            const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
            ws.send(ssmlMessage);
        };

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                // Text message - check for turn.end
                if (event.data.includes('Path:turn.end')) {
                    clearTimeout(timeout);
                    ws.close();

                    // Combine all audio chunks
                    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    const result = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of audioChunks) {
                        result.set(chunk, offset);
                        offset += chunk.length;
                    }
                    resolve(result);
                }
            } else if (event.data instanceof Blob) {
                // Binary message - audio data
                event.data.arrayBuffer().then((buffer) => {
                    const data = new Uint8Array(buffer);

                    // Edge TTS binary messages have a header before the audio data
                    // The header format is: 2 bytes (header length) + header + audio data
                    // We need to extract just the audio portion
                    if (data.length > 2) {
                        const headerLength = (data[0] << 8) | data[1];
                        if (data.length > 2 + headerLength) {
                            const audioData = data.slice(2 + headerLength);
                            if (audioData.length > 0) {
                                audioChunks.push(audioData);
                            }
                        }
                    }
                });
            } else if (event.data instanceof ArrayBuffer) {
                // ArrayBuffer handling
                const data = new Uint8Array(event.data);
                if (data.length > 2) {
                    const headerLength = (data[0] << 8) | data[1];
                    if (data.length > 2 + headerLength) {
                        const audioData = data.slice(2 + headerLength);
                        if (audioData.length > 0) {
                            audioChunks.push(audioData);
                        }
                    }
                }
            }
        };

        ws.onerror = (error) => {
            clearTimeout(timeout);
            reject(new Error(`Edge TTS WebSocket error: ${error}`));
        };

        ws.onclose = (event) => {
            clearTimeout(timeout);
            if (audioChunks.length === 0) {
                reject(new Error(`Edge TTS closed without audio data. Code: ${event.code}`));
            }
        };
    });
}

/**
 * Generate TTS with automatic fallback
 * Tries Edge TTS first (free, returns MP3), falls back to Gemini if it fails
 */
export async function generateTTSWithFallback(
    text: string,
    options: EdgeTTSOptions = {},
    geminiApiKey?: string
): Promise<{ audio: Uint8Array; mimeType: string; source: 'edge' | 'gemini' }> {
    // Try Edge TTS first (free and returns MP3)
    try {
        console.log('[TTS] Attempting Edge TTS...');
        const audio = await generateEdgeTTS(text, options);
        console.log('[TTS] Edge TTS successful, returning MP3');
        return { audio, mimeType: 'audio/mpeg', source: 'edge' };
    } catch (edgeError) {
        console.warn('[TTS] Edge TTS failed:', edgeError);

        // Fall back to Gemini if API key is available
        if (!geminiApiKey) {
            throw new Error('Edge TTS failed and no Gemini API key available for fallback');
        }

        console.log('[TTS] Falling back to Gemini TTS...');

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: 'Kore' }
                            }
                        }
                    }
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini TTS failed: ${response.status}`);
        }

        const data = await response.json();
        const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

        if (!audioData?.data) {
            throw new Error('No audio data in Gemini response');
        }

        // Gemini returns PCM, convert to WAV
        const { pcmToWav } = await import('./audio-utils');
        const audioBytes = Uint8Array.from(atob(audioData.data), c => c.charCodeAt(0));
        const wavBytes = pcmToWav(audioBytes, 24000);

        console.log('[TTS] Gemini TTS successful, returning WAV');
        return { audio: wavBytes, mimeType: 'audio/wav', source: 'gemini' };
    }
}
