import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Extract phrases from content using Gemini 2.0 Flash
 * Admin-only endpoint
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Base URL for native API - model will be appended
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        if (!isAdmin(email)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'Gemini API key not configured' },
                { status: 500 }
            );
        }

        const { content } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        // Extract natural, native-like phrases
        const prompt = `Extract common phrases and expressions from this text that native English speakers use in everyday situations.

Focus on:
- Conversational phrases (greetings, reactions, transitions)
- Common idioms and expressions
- Phrasal verbs used in daily life
- Colloquialisms and informal language
- Phrases for expressing emotions, opinions, or making requests

Prioritize phrases that sound natural and native-like, rather than textbook English.

Text:
"""
${content.substring(0, 50000)}
"""

Return ONLY a JSON array with 20-30 phrases. Example: ["break the ice", "I couldn't agree more", "it goes without saying"]`;

        const response = await fetch(`${GEMINI_BASE_URL}/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 2000,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini extract-phrases error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to extract phrases: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Log token usage (Native API format)
        if (data.usageMetadata) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'admin',
                endpoint: 'admin-extract-phrases',
                model: 'gemini-3-flash-preview',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            // Clean markdown code blocks just in case
            let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanText);
            // Handle both array directly or object wrapper
            const phrases = Array.isArray(parsed) ? parsed : (parsed.phrases || []);

            if (Array.isArray(phrases)) {
                const validPhrases = phrases.filter((p): p is string =>
                    typeof p === 'string' && p.length > 0
                );
                return NextResponse.json({ phrases: validPhrases, success: true });
            }
            console.error('Invalid phrases format received:', cleanText);
            return NextResponse.json({ phrases: [], success: true });
        } catch (error) {
            console.error('Failed to parse phrases JSON:', error, 'Raw text:', text);
            return NextResponse.json({ phrases: [], success: true });
        }

    } catch {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
