import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * User translation API using QWEN via DashScope
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

export async function POST(request: NextRequest) {
    try {
        // Secure authentication - verify Firebase ID token (edge-compatible)
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Fallback for backward compatibility
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        if (!XAI_API_KEY) {
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

        const contentResponse = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
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
                model: 'grok-4-1-fast-reasoning',
                promptTokens: contentData.usage.prompt_tokens || 0,
                completionTokens: contentData.usage.completion_tokens || 0,
                totalTokens: contentData.usage.total_tokens || 0,
            });
        }

        // Translate title if provided
        let translatedTitle = '';
        if (title && typeof title === 'string') {
            const titlePrompt = `Translate this title to Vietnamese. Return ONLY the translated title: "${title}"`;

            const titleResponse = await fetch(XAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'grok-4-1-fast-reasoning',
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
                        model: 'grok-4-1-fast-reasoning',
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
