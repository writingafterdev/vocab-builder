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

        const prompt = `You are an expert translator who understands both Vietnamese and English at a native level.

The user wrote this mixed-language sentence:
"${text}"

${context ? `Context/Topic: ${context}` : ''}

YOUR GOAL: Translate the Vietnamese parts into English that captures the CORE MEANING and NUANCE, not just the literal words.

TRANSLATION PHILOSOPHY:
- Focus on WHAT the writer truly means to express, not each individual word
- Preserve the emotional weight and tone (是 forceful? gentle? frustrated?)
- Choose English words that a native speaker would naturally use in this context
- If a Vietnamese phrase implies something stronger/weaker than its literal translation, reflect that

EXAMPLES OF GOOD TRANSLATION (meaning-focused):
- "đừng có nghĩ đơn giản như vậy" → NOT "don't think simple like that" → BETTER: "don't oversimplify this"
- "tôi thấy rằng cái này có vấn đề" → NOT "I see that this has problem" → BETTER: "I think there's an issue here"
- "quan trọng nhất là" → NOT "most important is" → BETTER: "the key point is" / "what matters most is"

PRESERVE: Keep the user's original English exactly as written. Only replace Vietnamese.

Return JSON only:
{
    "suggestion": "The complete sentence with Vietnamese replaced by natural, meaning-focused English",
    "translations": [
        {"vietnamese": "original Vietnamese", "english": "natural English equivalent"}
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
