import { NextRequest, NextResponse } from 'next/server';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import { getRequestUser } from '@/lib/request-auth';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/practice/evaluate-response
 * AI evaluates a free-write response for active question types
 * (fix_argument, register_shift, synthesis_response)
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request);
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 });
        }

        const {
            questionType,
            prompt,
            context,
            evaluationCriteria,
            userResponse,
            passageText,
            expectedPhrases,       // Production tracking: phrases user should use
            expectedPhraseIds,     // Corresponding phrase IDs
        } = await request.json();

        if (!userResponse || !questionType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const criteriaText = evaluationCriteria?.length > 0
            ? `\nEvaluation criteria:\n${evaluationCriteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}`
            : '';

        // Build phrase tracking section for the AI prompt
        const hasExpectedPhrases = expectedPhrases && expectedPhrases.length > 0;
        const phraseTrackingPrompt = hasExpectedPhrases
            ? `\n\nPHRASE USAGE TRACKING:
The student was expected to use these phrases naturally in their response:
${expectedPhrases.map((p: string, i: number) => `${i + 1}. "${p}"`).join('\n')}

For EACH phrase, evaluate whether it was:
- "natural": Used smoothly and idiomatically in context
- "forced": Present but awkwardly inserted or clearly shoehorned
- "missing": Not used at all

Include a "phraseUsage" array in your response with one entry per expected phrase.`
            : '';

        const contextText = context || '';
        const extendedContext = passageText || contextText;

        const evalPrompt = `You are evaluating a student's response to a thinking exercise.

QUESTION TYPE: ${questionType}
QUESTION PROMPT: ${prompt}
${contextText ? `QUESTION CONTEXT: "${contextText}"` : ''}
${criteriaText}

FULL REFERENCE CONTEXT (for support only):
"${(extendedContext || '').slice(0, 1000)}"

STUDENT'S RESPONSE:
"${userResponse}"

Evaluate the response and return JSON:
{
  "pass": true/false,
  "feedback": "2-3 sentence explanation. Be encouraging but honest.",
  "suggestion": "If not passing, a specific actionable suggestion. If passing, null."${hasExpectedPhrases ? `,
  "phraseUsage": [
    { "phrase": "phrase text", "quality": "natural" | "forced" | "missing" }
  ]` : ''}
}

EVALUATION GUIDELINES:
- For "fix_argument": Check if the logical flaw is actually fixed, not just reworded.
- For "register_shift": Check if the register genuinely changed while preserving meaning.
- For "synthesis_response": Check if the response takes a clear position, uses vocabulary naturally, and shows original thinking.
- Be generous with "pass" — the bar is "genuine attempt that shows understanding", not perfection.
- A response that shows effort but misses the mark should pass=false with constructive feedback.${phraseTrackingPrompt}`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-non-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a supportive but rigorous writing coach. You evaluate responses for logical validity, register awareness, and original thinking. You respond ONLY in valid JSON.',
                    },
                    { role: 'user', content: evalPrompt },
                ],
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI eval error:', response.status, await response.text());
            return NextResponse.json({ evaluation: { pass: true, feedback: 'Could not evaluate — marked as complete.', suggestion: null } });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'evaluate-response',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parseResult = safeParseAIJson<{
            pass: boolean;
            feedback: string;
            suggestion: string | null;
            phraseUsage?: Array<{ phrase: string; quality: 'natural' | 'forced' | 'missing' }>;
        }>(content);

        if (!parseResult.success) {
            return NextResponse.json({ evaluation: { pass: true, feedback: 'Response recorded.', suggestion: null } });
        }

        // Build phraseUsageResults if we had expected phrases
        let phraseUsageResults = undefined;
        if (hasExpectedPhrases && parseResult.data.phraseUsage) {
            phraseUsageResults = parseResult.data.phraseUsage.map((pu, i) => ({
                phraseId: expectedPhraseIds?.[i] || '',
                phrase: pu.phrase,
                used: pu.quality !== 'missing',
                usageQuality: pu.quality,
            }));
        }

        return NextResponse.json({
            evaluation: {
                ...parseResult.data,
                phraseUsageResults,
            },
        });

    } catch (error) {
        console.error('Evaluate response error:', error);
        return NextResponse.json({ evaluation: { pass: true, feedback: 'Could not evaluate.', suggestion: null } });
    }
}
