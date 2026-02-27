import { NextRequest, NextResponse } from 'next/server';
import { fetchWithKeyRotation, getApiKeyCount } from '@/lib/api-key-rotation';

/**
 * Generate audio for an article using Gemini 2.5 Flash TTS
 * Admin-only endpoint - audio is stored on article and shared across all users
 * 
 * Uses API key rotation to bypass per-project rate limits.
 * Set AISTUDIO_API_KEYS env var with comma-separated keys.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

// Clean HTML content to plain text for TTS
function cleanTextForTTS(html: string): string {
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        // Allow any user to generate audio (not admin-only)
        // This is on-demand generation triggered by readers

        if (getApiKeyCount() === 0) {
            return NextResponse.json(
                { error: 'No AI Studio API keys configured. Set AISTUDIO_API_KEYS environment variable.' },
                { status: 500 }
            );
        }

        const { content, title, voice = 'Kore' } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        // Clean and prepare text
        let fullText = '';
        if (title) {
            fullText = `${title}. `;
        }
        fullText += cleanTextForTTS(content);

        if (fullText.length < 10) {
            return NextResponse.json(
                { error: 'Content too short to generate audio' },
                { status: 400 }
            );
        }

        // Limit text length for TTS (32k token context window)
        const maxChars = 25000; // Reasonable limit for an article
        if (fullText.length > maxChars) {
            fullText = fullText.substring(0, maxChars) + '...';
        }

        // Reading styles for variety - Gemini TTS interprets these naturally
        const readingStyles = [
            { tone: 'calm and thoughtful', pace: 'measured', description: 'Read this article in a calm, thoughtful manner with clear enunciation' },
            { tone: 'warm and engaging', pace: 'conversational', description: 'Read this article like sharing an interesting story with a friend' },
            { tone: 'professional and clear', pace: 'steady', description: 'Read this article like a professional narrator, clear and articulate' },
            { tone: 'enthusiastic and lively', pace: 'energetic', description: 'Read this article with enthusiasm, like an excited storyteller' },
            { tone: 'gentle and soothing', pace: 'relaxed', description: 'Read this article gently, perfect for focused learning' },
            { tone: 'confident and authoritative', pace: 'deliberate', description: 'Read this article with confidence, like an expert sharing knowledge' },
            { tone: 'curious and contemplative', pace: 'thoughtful', description: 'Read this article as if discovering something fascinating' },
            { tone: 'friendly and approachable', pace: 'natural', description: 'Read this article in a friendly, natural way' },
        ];

        // Pick a random style
        const selectedStyle = readingStyles[Math.floor(Math.random() * readingStyles.length)];

        // Prepend style instruction to the text
        const styledText = `[${selectedStyle.description}. Use a ${selectedStyle.tone} tone with a ${selectedStyle.pace} pace.]\n\n${fullText}`;

        // Random voice selection for more variety
        const voices = ['Kore', 'Aoede', 'Puck', 'Charon'];
        const selectedVoice = voices[Math.floor(Math.random() * voices.length)];

        // Call Gemini 2.5 Flash TTS with key rotation
        const response = await fetchWithKeyRotation(
            (apiKey) => `${GEMINI_BASE_URL}/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: styledText }]
                    }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: selectedVoice
                                }
                            }
                        }
                    }
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini TTS error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to generate audio: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();

        // Extract audio data from response
        const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

        if (!audioData || !audioData.data) {
            console.error('No audio data in response:', data);
            return NextResponse.json(
                { error: 'No audio data received' },
                { status: 500 }
            );
        }

        // Estimate duration (rough: ~150 words per minute, ~5 chars per word)
        const wordCount = fullText.split(/\s+/).length;
        const estimatedDurationSeconds = Math.ceil((wordCount / 150) * 60);

        return NextResponse.json({
            success: true,
            audioBase64: audioData.data,
            mimeType: audioData.mimeType || 'audio/L16;rate=24000',
            voice,
            textLength: fullText.length,
            estimatedDurationSeconds,
        });

    } catch (error) {
        console.error('Generate article audio error:', error);
        return NextResponse.json(
            { error: 'Failed to generate audio' },
            { status: 500 }
        );
    }
}
