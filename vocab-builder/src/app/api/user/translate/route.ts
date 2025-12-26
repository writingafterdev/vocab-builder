import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * User translation API using QWEN via DashScope
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json(
                { error: 'Translation API key not configured' },
                { status: 500 }
            );
        }

        const { text, title } = await request.json();

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        // Translate content
        const contentPrompt = `Translate the following English text to Vietnamese. 
Important:
- Preserve ALL HTML tags exactly as they are
- Only translate the text content between tags
- Use natural, fluent Vietnamese
- Return ONLY the translated text with HTML preserved

Text to translate:
"""
${text}
"""`;

        const contentResponse = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: contentPrompt }],
                max_tokens: 8000,
            }),
        });

        if (!contentResponse.ok) {
            return NextResponse.json({ error: 'Failed to translate' }, { status: 500 });
        }

        const contentData = await contentResponse.json();
        const translatedContent = contentData.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage for content translation
        const userId = request.headers.get('x-user-id') || 'anonymous';
        if (contentData.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'user-translate',
                model: 'deepseek-chat',
                promptTokens: contentData.usage.prompt_tokens || 0,
                completionTokens: contentData.usage.completion_tokens || 0,
                totalTokens: contentData.usage.total_tokens || 0,
            });
        }

        // Translate title if provided
        let translatedTitle = '';
        if (title && typeof title === 'string') {
            const titlePrompt = `Translate this title to Vietnamese. Return ONLY the translated title: "${title}"`;

            const titleResponse = await fetch(DEEPSEEK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: titlePrompt }],
                    max_tokens: 200,
                }),
            });

            if (titleResponse.ok) {
                const titleData = await titleResponse.json();
                translatedTitle = titleData.choices?.[0]?.message?.content?.trim() || '';

                // Log token usage for title translation
                if (titleData.usage) {
                    logTokenUsage({
                        userId,
                        userEmail,
                        endpoint: 'user-translate-title',
                        model: 'deepseek-chat',
                        promptTokens: titleData.usage.prompt_tokens || 0,
                        completionTokens: titleData.usage.completion_tokens || 0,
                        totalTokens: titleData.usage.total_tokens || 0,
                    });
                }
            }
        }

        return NextResponse.json({
            translatedContent,
            translatedTitle,
            success: true
        });

    } catch {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
