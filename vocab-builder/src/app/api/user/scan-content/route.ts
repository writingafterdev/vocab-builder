
import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { safeParseAIJson } from '@/lib/ai-utils';
import { getRequestUser } from '@/lib/request-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        const userEmail = authUser?.userEmail;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'AI service not configured' },
                { status: 500 }
            );
        }

        const { content, comments, title } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        // Combine content and comments for context, but prioritize article content
        const commentsText = Array.isArray(comments)
            ? comments.slice(0, 10).join('\n\n') // Limit to top 10 comments to save context
            : (comments || '');

        const fullContext = `
ARTICLE TITLE: "${title || 'Untitled'}"
ARTICLE CONTENT:
${content.substring(0, 30000)}

TOP COMMENTS:
${commentsText.substring(0, 10000)}
`;

        const prompt = `Analyze this text (article + comments) and extract the 8-12 most valuable English expressions for an advanced learner (B2-C2).

IMPORTANT: You MUST extract at least 3-4 phrases specifically from the "TOP COMMENTS" section if they are high quality.

SELECTION CRITERIA:
1. **Idioms & Phrasal Verbs** (e.g., "boil down to", "play devil's advocate")
2. **Strong Collocations** (e.g., "stark contrast", "mitigate risks")
3. **Conversational Transitions** (found in comments, e.g., "having said that", "on the flip side")
4. **Sophisticated Vocabulary** (C1/C2 words in context)

EXCLUDE:
- Very common words (A1-B1)
- Highly technical jargon
- Proper nouns

Return a JSON object with a "phrases" array. Each item must have:
- "phrase": The expression in base form.
- "meaning": A concise definition (max 10 words).
- "context": The exact sentence (or part of it) where it appears in the text.
- "type": One of "idiom", "collocation", "phrasal_verb", "vocabulary".
- "topic": A specific theme tag (e.g., "Shopping", "Work").
- "subtopic": A specific nuance within the topic (e.g., "Price Discussion", "Negotiation", "Deadlines"). NOT the grammatical type.
- "explanation": Why it's useful (e.g., "Great for expressing disagreement").

Text to Analyze:
"""
${fullContext}
"""
`;

        const response = await fetch(`${GEMINI_BASE_URL}/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
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
            console.error('Gemini scan-content error:', response.status, errorText);
            return NextResponse.json(
                { error: 'AI analysis failed' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Log token usage
        if (data.usageMetadata && userId) {
            logTokenUsage({
                userId: userId,
                userEmail: userEmail || 'unknown',
                endpoint: 'user-scan-content',
                model: 'gemini-2.0-flash-exp',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parseResult = safeParseAIJson<{ phrases?: unknown[] } | unknown[]>(cleanText);
            if (!parseResult.success) {
                console.error('Failed to parse scan results:', parseResult.error);
                return NextResponse.json({ phrases: [], success: false, error: 'Failed to parse AI response' });
            }
            const parsed = parseResult.data;
            const phrases = (parsed as { phrases?: unknown[] }).phrases || (Array.isArray(parsed) ? parsed : []);

            return NextResponse.json({ phrases, success: true });
        } catch (error) {
            console.error('Failed to parse scan results:', error);
            return NextResponse.json({ phrases: [], success: false, error: 'Failed to parse AI response' });
        }

    } catch (error) {
        console.error('Scan content error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
