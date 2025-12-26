import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Process article content using Gemini 3 Flash
 * - Extracts phrases
 * - Generates caption
 * - Translates title and content to Vietnamese
 * Admin-only endpoint
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Base URL for native API
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

        const { title, content } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        const prompt = `You are an expert content editor and translator. Process this English article for a Vietnamese audience.

Tasks:
1. Extract 20-30 natural English phrases/expressions/idioms from the text.
2. Generate a short, witty, and engaging caption (2-3 sentences) in the style of The New Yorker's Instagram. It should be lowercase, slightly dry/humorous or deep/observational, and often uses first-person "i" or generic "you". Avoid "Explore..." or "Discover..." or standard formal summaries. Make it feel like a mood.
3. Translate the Title to natural Vietnamese.
4. Translate the Content to natural Vietnamese (Html format preserved).

Input Title: "${title || ''}"
Input Content:
"""
${content.substring(0, 50000)}
"""

Return JSON format:
{
  "phrases": ["phrase 1", "phrase 2"],
  "caption": "English caption...",
  "translatedTitle": "Vietnamese title...",
  "translatedContent": "Vietnamese content..."
}`;

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
                    maxOutputTokens: 8192,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini process-article error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to process article: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Log token usage
        if (data.usageMetadata) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'admin',
                endpoint: 'admin-process-article',
                model: 'gemini-3-flash-preview',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            const parsed = JSON.parse(text);
            return NextResponse.json({
                phrases: parsed.phrases || [],
                caption: parsed.caption || '',
                translatedTitle: parsed.translatedTitle || '',
                translatedContent: parsed.translatedContent || '',
                success: true
            });
        } catch (error) {
            console.error('Failed to parse process-article JSON:', error, 'Raw text:', text);
            return NextResponse.json({ error: 'Failed to parse AI response', success: false }, { status: 500 });
        }

    } catch (error) {
        console.error('Process article error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
