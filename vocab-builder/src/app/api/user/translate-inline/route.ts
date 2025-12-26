import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Inline translation API - translates Vietnamese words in mixed sentences
 * Uses qwen-plus for more natural, contextual translations
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface TranslateRequest {
    text: string;
    context?: string;
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: TranslateRequest = await request.json();
        const { text, context } = body;

        if (!text) {
            return NextResponse.json({ error: 'Missing text' }, { status: 400 });
        }

        // Detect Vietnamese characters
        const vietnameseRegex = /[\u00C0-\u1EF9]/;
        if (!vietnameseRegex.test(text)) {
            return NextResponse.json({
                hasVietnamese: false,
                suggestion: null
            });
        }

        const prompt = `You are a skilled translator helping someone who is typing a sentence mixing Vietnamese and English.

The user wrote:
"${text}"

${context ? `Topic they're discussing: ${context}` : ''}

YOUR TASK:
Find the Vietnamese words/phrases in the text and replace them with natural English that:
1. Captures the MEANING (not word-for-word translation)
2. Sounds fluent and native in the context
3. Preserves the user's original English exactly as written

EXAMPLES:
- "we should not bỏ qua this issue" → "we should not overlook this issue"
- "this is really quan trọng for success" → "this is really crucial for success"  
- "I muốn nói rằng technology helps" → "I want to say that technology helps"

Return JSON only:
{
    "suggestion": "The complete sentence with Vietnamese replaced by natural English",
    "translations": [
        {"vietnamese": "bỏ qua", "english": "overlook"}
    ]
}`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',  // Using qwen-plus for better translations
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            console.error('Translation API error:', await response.text());
            return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'translate-inline',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Parse JSON from response
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error('JSON parse error:', content);
            return NextResponse.json({
                hasVietnamese: true,
                suggestion: null,
                error: 'Failed to parse translation'
            });
        }

        return NextResponse.json({
            hasVietnamese: true,
            suggestion: parsed.suggestion || null,
            translations: parsed.translations || [],
        });

    } catch (error) {
        console.error('Translate inline error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
