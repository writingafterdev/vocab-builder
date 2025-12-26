import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Admin translation API using Gemini 2.0 Flash
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

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

        const { text } = await request.json();

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        const prompt = `Translate the following English text to Vietnamese. 
Important:
- Preserve ALL HTML tags exactly as they are
- Only translate the text content between tags
- Use natural, fluent Vietnamese
- Return ONLY the translated text with HTML preserved

Text to translate:
"""
${text}
"""`;

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GEMINI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gemini-3-flash-preview',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 8000,
            }),
        });

        if (!response.ok) {
            console.log('Gemini translate error:', response.status);
            return NextResponse.json(
                { error: 'Failed to translate' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const translatedText = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'admin',
                endpoint: 'admin-translate',
                model: 'gemini-3-flash',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        return NextResponse.json({
            translatedText: translatedText.trim(),
            success: true
        });

    } catch {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
