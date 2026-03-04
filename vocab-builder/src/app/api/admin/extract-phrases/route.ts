import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Extract phrases from content using DeepSeek
 * Admin-only endpoint
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

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

        if (!XAI_API_KEY) {
            return NextResponse.json(
                { error: 'DeepSeek API key not configured' },
                { status: 500 }
            );
        }

        const { content, title } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        const prompt = `Extract the most valuable phrases and expressions for English learners from this article.

ARTICLE TITLE: "${title || 'Untitled'}"

SELECTION CRITERIA (in priority order):

1. **Topic-related expressions** - Phrases directly related to the article's theme/topic
2. **High-frequency phrases** - Common expressions used in everyday English (top 5000 corpus)
3. **Natural expressions** - How native speakers actually talk:
   - Conversational phrases (greetings, reactions, transitions)
   - Common idioms and expressions
   - Phrasal verbs used in daily life
   - Colloquialisms
4. **Collocations** - Natural word pairings (make a decision, heavy rain, etc.)
5. **Learner-value** - Phrases B1-C1 learners should know but often miss

EXCLUDE:
- Technical jargon specific to one field
- Very rare expressions (< 1 per million words)
- Clichés or overused phrases
- Single words (extract phrases with 2+ words)

Text:
"""
${content.substring(0, 50000)}
"""

Return ONLY a JSON array with 15-25 phrases in BASE FORM (use one's/someone's for pronouns).
Example: ["break the ice", "get one's act together", "it goes without saying", "at the end of the day"]`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [
                    { role: 'system', content: 'You are a linguistics expert specializing in English language learning. Always respond with valid JSON.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek extract-phrases error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to extract phrases: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'admin',
                endpoint: 'admin-extract-phrases',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        try {
            let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanText);
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
