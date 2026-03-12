import { NextRequest, NextResponse } from 'next/server';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { buildPhraseDetectionPrompt } from '@/lib/prompts/system-design-prompts';

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/exercise/evaluate-production
 *
 * Evaluates a user's open-ended writing response for naturalness
 * of target phrase usage. Uses the buildPhraseDetectionPrompt
 * from system-design-prompts.ts (4-tier naturalness rubric).
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { targetPhrases, userResponse }: {
            targetPhrases: string[];
            userResponse: string;
        } = body;

        if (!targetPhrases?.length || !userResponse?.trim()) {
            return NextResponse.json({ error: 'Missing targetPhrases or userResponse' }, { status: 400 });
        }

        // Build the phrase list for the prompt
        const phraseList = targetPhrases
            .map((p, i) => `${i + 1}. "${p}"`)
            .join('\n');

        const prompt = buildPhraseDetectionPrompt(phraseList, userResponse);

        // Fallback if no API key (dev mode)
        if (!XAI_API_KEY) {
            const mockDetections = targetPhrases.map(phrase => ({
                phrase,
                detected: userResponse.toLowerCase().includes(phrase.toLowerCase()),
                tier: userResponse.toLowerCase().includes(phrase.toLowerCase()) ? 'ACCEPTABLE' : 'NOT_USED',
                reasoning: userResponse.toLowerCase().includes(phrase.toLowerCase())
                    ? `Found "${phrase}" in the response — usage appears contextually appropriate.`
                    : `"${phrase}" was not found in the response.`,
            }));
            return NextResponse.json({ detections: mockDetections });
        }

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a native English speaker with 10+ years of ESL teaching experience. Evaluate phrase usage for naturalness. Return JSON only.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 800,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI production eval error:', await response.text());
            return NextResponse.json({ error: 'AI evaluation failed' }, { status: 500 });
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content?.trim() || '';

        // Log tokens
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'evaluate-production',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parsed = safeParseAIJson<{
            detections: Array<{
                phraseIndex?: number;
                phrase: string;
                detected: boolean;
                usedForm?: string;
                reasoning: string;
                tier: string;
                confidence?: string;
            }>;
        }>(raw);

        if (!parsed.success || !parsed.data?.detections) {
            console.error('Production eval parse failed');
            return NextResponse.json({ error: 'Failed to parse evaluation' }, { status: 500 });
        }

        // Normalize response
        const detections = parsed.data.detections.map(d => ({
            phrase: d.phrase,
            detected: d.detected,
            tier: d.tier,
            reasoning: d.reasoning,
        }));

        return NextResponse.json({ detections });

    } catch (error) {
        console.error('Evaluate production error:', error);
        return NextResponse.json(
            { error: 'Failed to evaluate production' },
            { status: 500 }
        );
    }
}
