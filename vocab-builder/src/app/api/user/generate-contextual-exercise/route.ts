// Generate contextual writing exercises for vocabulary practice

import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { safeParseAIJson } from '@/lib/ai-utils';

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

interface ContextualExerciseRequest {
    phrases: Array<{
        id: string;
        phrase: string;
        meaning?: string;
        register?: string;
        nuance?: string;
    }>;
    userId?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: ContextualExerciseRequest = await request.json();
        const { phrases, userId } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json(
                { error: 'No phrases provided' },
                { status: 400 }
            );
        }

        if (!XAI_API_KEY) {
            // Return mock response for development
            return NextResponse.json({
                exercise: {
                    theme: 'Daily Life',
                    question: 'Describe a time when you had to make a difficult decision. What factors did you consider?',
                    phrases: phrases.map(p => p.phrase),
                    hints: phrases.map(p => p.meaning || 'Use this phrase naturally'),
                },
                success: true,
                isMock: true,
            });
        }

        // Select up to 4 phrases for the exercise
        const selectedPhrases = phrases.slice(0, 4);
        const phraseList = selectedPhrases.map(p => `- "${p.phrase}"${p.meaning ? ` (${p.meaning})` : ''}`).join('\n');

        const prompt = `Create a writing exercise for an English learner to practice these vocabulary items:

${phraseList}

Generate a CONTEXTUAL WRITING PROMPT that:
1. Gives a relatable situation or question the learner can respond to
2. Naturally calls for using all the target phrases
3. Is open-ended enough for creative response (50-150 words)
4. Matches the register of the words (casual words = casual prompt, formal words = professional prompt)

Also provide a SHORT HINT for each phrase (how/when to use it in this context).

Return JSON only:
{
  "theme": "A short label for the topic (e.g., Work Challenges, Social Plans, Life Advice)",
  "question": "The writing prompt - a question or scenario for the learner to respond to. Make it personal and engaging.",
  "hints": [
    "Hint for phrase 1 - when/how to use it in response",
    "Hint for phrase 2 - when/how to use it in response",
    ...
  ]
}

Make the question feel like something a friend would ask, not like a school assignment.`;

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
                        content: 'You are a language learning assistant. Generate engaging writing prompts that encourage natural use of vocabulary. Return JSON only.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('Grok API error:', await response.text());
            return NextResponse.json(
                { error: 'Failed to generate exercise' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        const userEmail = request.headers.get('x-user-email') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId: userId || 'anonymous',
                userEmail,
                endpoint: 'generate-contextual-exercise',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Parse JSON response
        const cleanedContent = content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parseResult = safeParseAIJson<{ theme?: string; question: string; hints?: string[] }>(cleanedContent);
        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            return NextResponse.json({ error: 'AI returned invalid format' }, { status: 502 });
        }
        const parsed = parseResult.data;

        return NextResponse.json({
            exercise: {
                theme: parsed.theme || 'Writing Practice',
                question: parsed.question,
                phrases: selectedPhrases.map(p => p.phrase),
                hints: parsed.hints || selectedPhrases.map(() => 'Use naturally in your response'),
                phraseIds: selectedPhrases.map(p => p.id),  // Track which phrases were used
            },
            success: true,
        });

    } catch (error) {
        console.error('Generate contextual exercise error:', error);
        return NextResponse.json(
            { error: 'Failed to generate exercise' },
            { status: 500 }
        );
    }
}
