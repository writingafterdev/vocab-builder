import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Generate phrase meaning using QWEN via Alibaba Cloud DashScope
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface GenerateMeaningRequest {
    phrase: string;
    context?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateMeaningRequest = await request.json();
        const { phrase, context } = body;

        if (!phrase) {
            return NextResponse.json(
                { error: 'Phrase is required' },
                { status: 400 }
            );
        }

        if (!DEEPSEEK_API_KEY) {
            // Return mock response if no API key (for development)
            return NextResponse.json({
                meaning: `A common English expression or phrase that conveys a specific meaning in context.`,
                difficulty: 'intermediate',
                success: true,
                isMock: true
            });
        }

        const prompt = `Analyze the English phrase: "${phrase}"
${context ? `Example context: "${context}"` : ''}

Provide a COMPREHENSIVE meaning that covers:
1. The CORE meaning - what does this phrase universally mean?
2. WHEN to use it - what situations call for this phrase?
3. HOW it's commonly used - typical patterns and collocations
4. Any NUANCES - subtle differences, connotations, or variations

Write it as one flowing explanation (2-3 sentences) that a learner can quickly understand. Start with what the phrase means, then explain when/how to use it.

Example format: "This phrase means [core meaning]. It's commonly used when [situations]. Often appears in contexts like [examples]."

Classify usage:
- "neutral" = Works in both casual speech and formal writing
- "written" = More formal/professional (essays, work emails, articles)
- "spoken" = More casual (conversations, texting, social media)

Respond in JSON only:
{"meaning": "Comprehensive explanation covering when/how to use...", "difficulty": "beginner|intermediate|advanced", "usage": "spoken|written|neutral"}`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to generate meaning' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        const userEmail = request.headers.get('x-user-email') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-meaning',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        if (!content) {
            return NextResponse.json(
                { error: 'No content generated' },
                { status: 500 }
            );
        }

        // Parse JSON response
        try {
            const jsonMatch = content.match(/\{[\s\S]*"meaning"[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return NextResponse.json({
                    meaning: parsed.meaning,
                    difficulty: parsed.difficulty || 'intermediate',
                    usage: parsed.usage || 'neutral',
                    success: true,
                });
            }

            // Fallback: just return the content
            return NextResponse.json({
                meaning: content,
                difficulty: 'intermediate',
                usage: 'neutral',
                success: true,
            });
        } catch {
            return NextResponse.json({
                meaning: content,
                difficulty: 'intermediate',
                success: true,
            });
        }

    } catch {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
