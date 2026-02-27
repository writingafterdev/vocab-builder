import { NextRequest, NextResponse } from 'next/server';
import { safeParseAIJson } from '@/lib/ai-utils';
import {
    QuestionResult,
    QuestionAnswer,
    calculateXp,
    DEFAULT_PRACTICE_CONFIG
} from '@/lib/db/practice-types';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

interface EvaluateRequest {
    questionId: string;
    targetPhrase: string;
    expectedRegister: 'casual' | 'consultative' | 'formal';
    expectedNuance: 'negative' | 'neutral' | 'positive';
    scenarioText: string;
    userResponse: string;
    responseTimeMs: number;
    mode: 'in_context' | 'open_production';
    selectedIndex?: number;  // For MCQ mode
    correctIndex?: number;   // For MCQ mode
}

/**
 * Evaluate user's practice response
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: EvaluateRequest = await request.json();
        const {
            questionId,
            targetPhrase,
            expectedRegister,
            expectedNuance,
            scenarioText,
            userResponse,
            responseTimeMs,
            mode,
            selectedIndex,
            correctIndex,
        } = body;

        let result: QuestionResult;
        let feedback: string;
        const config = DEFAULT_PRACTICE_CONFIG;

        // Calculate if response was fast enough
        const timeLimit = config.timeLimits[expectedRegister] * 1000; // Convert to ms
        const isFast = responseTimeMs <= timeLimit * 0.7; // Fast = within 70% of limit
        const isTooSlow = responseTimeMs > timeLimit;

        if (isTooSlow) {
            result = 'wrong';
            feedback = `⏱️ Time's up! You took ${Math.round(responseTimeMs / 1000)}s but the limit was ${config.timeLimits[expectedRegister]}s. Try to respond more quickly!`;
        } else if (mode === 'in_context') {
            // MCQ mode - check selected index
            if (selectedIndex === correctIndex) {
                result = 'correct';
                feedback = isFast
                    ? '✓ Perfect! Quick and correct response.'
                    : '✓ Correct! The register and nuance match the situation.';
            } else {
                result = 'wrong';
                feedback = 'Not quite right. Check the register and nuance of your choice.';
            }
        } else {
            // Open production mode - use AI to evaluate
            const evaluation = await evaluateOpenResponse(
                targetPhrase,
                expectedRegister,
                expectedNuance,
                scenarioText,
                userResponse
            );
            result = evaluation.result;
            feedback = evaluation.feedback;
        }

        // Calculate XP
        const xpEarned = calculateXp(result, isFast, config);

        const answer: QuestionAnswer = {
            questionId,
            response: userResponse,
            selectedIndex,
            result,
            responseTimeMs,
            xpEarned,
            feedback,
        };

        return NextResponse.json({
            answer,
            success: true,
        });

    } catch (error) {
        console.error('Evaluate practice error:', error);
        return NextResponse.json(
            { error: 'Failed to evaluate response' },
            { status: 500 }
        );
    }
}

/**
 * Use AI to evaluate open production response
 */
async function evaluateOpenResponse(
    targetPhrase: string,
    expectedRegister: string,
    expectedNuance: string,
    scenarioText: string,
    userResponse: string
): Promise<{ result: QuestionResult; feedback: string }> {
    if (!DEEPSEEK_API_KEY) {
        // Fallback: simple string matching
        const hasPhrase = userResponse.toLowerCase().includes(targetPhrase.toLowerCase());
        return {
            result: hasPhrase ? 'correct' : 'wrong',
            feedback: hasPhrase
                ? '✓ Good use of the target phrase!'
                : `Try incorporating "${targetPhrase}" in your response.`,
        };
    }

    const prompt = `Evaluate this language learning response.

Scenario: ${scenarioText}

Target phrase the learner should use: "${targetPhrase}"
Expected register: ${expectedRegister}
Expected nuance: ${expectedNuance}

Learner's response: "${userResponse}"

Evaluate:
1. Did they use the target phrase or an acceptable variant?
2. Is the register appropriate for the scenario?
3. Is the nuance appropriate for the scenario?

Return JSON:
{
  "result": "correct" | "partial" | "wrong",
  "feedback": "Brief, encouraging feedback explaining the evaluation"
}

Guidelines:
- "correct" = phrase used appropriately with right register/nuance
- "partial" = right idea but wrong register OR missing the exact phrase but good intent
- "wrong" = completely off, wrong meaning, or inappropriate register`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a language learning evaluator. Be encouraging but accurate. Always return valid JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 200,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('DeepSeek API error:', await response.text());
            throw new Error('API error');
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        const cleanedContent = content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parseResult = safeParseAIJson<{ result: string; feedback: string }>(cleanedContent);
        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            // Fallback
            const hasPhrase = userResponse.toLowerCase().includes(targetPhrase.toLowerCase());
            return {
                result: hasPhrase ? 'correct' : 'wrong',
                feedback: hasPhrase ? '✓ Good response!' : 'Try to use the target phrase more naturally.',
            };
        }

        return {
            result: parseResult.data.result as QuestionResult,
            feedback: parseResult.data.feedback,
        };

    } catch (error) {
        console.error('Error evaluating response:', error);
        // Fallback
        const hasPhrase = userResponse.toLowerCase().includes(targetPhrase.toLowerCase());
        return {
            result: hasPhrase ? 'correct' : 'wrong',
            feedback: hasPhrase
                ? '✓ Good response!'
                : 'Try to use the target phrase more naturally.',
        };
    }
}
