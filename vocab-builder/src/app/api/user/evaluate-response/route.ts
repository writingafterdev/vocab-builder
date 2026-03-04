import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { AIEvaluationResult, ExerciseQuestionType } from '@/lib/db/types';
import { safeParseAIJson } from '@/lib/ai-utils';

/**
 * Evaluate free response and register swap answers using AI
 */

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_API_KEY = process.env.XAI_API_KEY;

interface EvaluateRequest {
    questionType: 'free_response' | 'register_swap';
    userResponse: string;
    targetPhrase: string;
    context: string;
    // For register_swap
    originalPhrase?: string;
    originalRegister?: string;
    targetRegister?: string;
}

export async function POST(request: NextRequest) {
    try {
        // Auth
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email') || 'local-dev@example.com';

        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: EvaluateRequest = await request.json();
        const { questionType, userResponse, targetPhrase, context } = body;

        if (!userResponse || !targetPhrase) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        let prompt = '';

        if (questionType === 'free_response') {
            prompt = `You are an encouraging English tutor who helps learners grow confident while gently improving their skills.

TASK: Evaluate this learner's sentence using the target phrase, with SOCIAL CONTEXT awareness.

TARGET PHRASE: "${targetPhrase}"
CONTEXT: ${context}
LEARNER'S SENTENCE: "${userResponse}"

EVALUATION APPROACH:
1. **START POSITIVE** - Find something genuinely good, even in imperfect answers
2. **PHRASE-BY-PHRASE** - Analyze key word choices for naturalness
3. **SOCIAL REASONING** - Explain WHY something sounds off (not just what)
4. **NATIVE ALTERNATIVE** - Show how a native speaker would say it

CRITERIA:
- Did they use the phrase correctly? (meaning + grammar)
- Does it sound NATURAL? (would a native speaker say this?)
- Does it FIT the social context? (register, formality, relationship)
- What's the social implication of their word choices?

NATURALNESS LEVELS:
- "natural" = Native speakers would say this
- "forced" = Correct but sounds like a textbook or awkward  
- "incorrect" = Wrong usage or meaning

BE GENEROUS: If the attempt shows understanding, give partial credit.

JSON RESPONSE:
{
    "correct": true/false,
    "naturalness": "natural" | "forced" | "incorrect",
    "overallScore": 1-10,
    "feedback": "Start with what they did well. Then gentle improvement if needed.",
    "whatWorked": "Specific thing they got right",
    "phraseAnalysis": [
        {
            "phrase": "specific word or phrase from their answer",
            "contextFit": "good" | "mismatch" | "awkward",
            "feedback": "Brief explanation of why this works or doesn't",
            "socialReasoning": "What social impression this gives (optional)",
            "naturalAlternative": "What a native might say instead (if needed)"
        }
    ],
    "suggestion": "A more natural way to say it (only if forced/incorrect)",
    "nativeWouldSay": "How a native speaker would express the same idea"
}

Return ONLY valid JSON.`;


        } else if (questionType === 'register_swap') {
            const { originalPhrase, originalRegister, targetRegister } = body;

            prompt = `You are an encouraging English tutor specializing in register awareness (casual vs formal language).

TASK: Evaluate if the learner correctly converted this phrase to a different register.

ORIGINAL: "${originalPhrase}" (${originalRegister})
TARGET REGISTER: ${targetRegister}
LEARNER'S ANSWER: "${userResponse}"

REGISTER GUIDE:
- CASUAL: contractions, slang, simple words ("gonna", "wanna", "cool", "stuff")
- CONSULTATIVE: neutral professional ("would like", "regarding", "appreciate")
- FORMAL: business/academic ("hereby", "pursuant to", "acknowledge")

EVALUATION:
1. Does it convey the SAME meaning?
2. Is it actually in the ${targetRegister} register?
3. Does it sound natural (not awkward or forced)?

BE FLEXIBLE: Accept reasonable variations. There are many right answers!

JSON RESPONSE:
{
    "correct": true/false,
    "naturalness": "natural" | "forced" | "incorrect",
    "feedback": "Acknowledge what they got right. Explain register if needed.",
    "suggestion": "One good example in the target register (for learning)",
    "acceptableAlternatives": ["other", "valid", "options"]
}

Return ONLY valid JSON.`;
        }

        // Call DeepSeek API
        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.3,  // Lower temp for consistent evaluation
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('Grok API error:', await response.text());
            return NextResponse.json({ error: 'Failed to evaluate response' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'evaluate-response',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean and parse
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            const parseResult = safeParseAIJson<AIEvaluationResult>(text);
            if (!parseResult.success) throw new Error(parseResult.error);
            const result = parseResult.data;

            return NextResponse.json({
                ...result,
                success: true,
            });

        } catch (parseError) {
            console.error('JSON parse error:', parseError);

            // Fallback: be generous
            return NextResponse.json({
                correct: true,
                naturalness: 'natural',
                feedback: 'Good effort! Keep practicing.',
                success: true,
                fallback: true,
            } as AIEvaluationResult & { success: boolean; fallback: boolean });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Evaluate response error:', errorMessage);
        return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
    }
}
