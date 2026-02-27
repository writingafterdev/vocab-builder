import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';

/**
 * Generate an ephemeral token for Gemini Live API
 * 
 * This token allows the browser to connect directly to Gemini Live
 * without exposing the API key. Token expires in 30 minutes.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        console.log('[Live Session Token] Creating token for user:', userId);

        if (!userId) {
            console.log('[Live Session Token] ERROR: No userId provided');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { systemInstruction } = body;
        console.log('[Live Session Token] System instruction length:', systemInstruction?.length || 0);

        // Initialize Gemini client with server-side API key
        const apiKey = process.env.GEMINI_API_KEY;
        console.log('[Live Session Token] API key present:', !!apiKey);
        console.log('[Live Session Token] API key prefix:', apiKey?.substring(0, 10) + '...');

        const client = new GoogleGenAI({
            apiKey: apiKey
        });

        // Token expires in 30 minutes
        const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        console.log('[Live Session Token] Token will expire at:', expireTime);

        // Create ephemeral token for Live API
        console.log('[Live Session Token] Creating ephemeral token...');
        const token = await client.authTokens.create({
            config: {
                uses: 1,
                expireTime: expireTime,
                liveConnectConstraints: {
                    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                    config: {
                        sessionResumption: {},
                        temperature: 0.7,
                        responseModalities: [Modality.AUDIO],
                        systemInstruction: systemInstruction || "You are a helpful and friendly conversation partner."
                    }
                },
                httpOptions: {
                    apiVersion: 'v1alpha'
                }
            }
        });

        console.log('[Live Session Token] Token created successfully:', token.name?.substring(0, 20) + '...');

        return NextResponse.json({
            token: token.name,
            expiresAt: expireTime,
            model: 'gemini-2.5-flash-native-audio-preview-12-2025'
        });

    } catch (error) {
        console.error('Ephemeral token creation error:', error);
        return NextResponse.json(
            { error: 'Failed to create session token' },
            { status: 500 }
        );
    }
}
