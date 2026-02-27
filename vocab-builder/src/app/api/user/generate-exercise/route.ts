import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { safeParseAIJson } from '@/lib/ai-utils';

/**
 * Generate bundled exercise for contextualized learning
 * Groups phrases by shared context and creates themed questions
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface PhraseWithContext {
    phraseId: string;
    phrase: string;
    meaning: string;
    contextId: string;       // Current context to practice
    contextName: string;     // "Workplace & Teams"
    contextQuestion: string; // Pre-generated question for this context
}

interface ExerciseBundleRequest {
    phrases: PhraseWithContext[];
}

interface GeneratedBundle {
    theme: string;
    question: string;
    phrases: string[];
    phraseIds: string[];
    contextIds: string[];
    hints: string[];  // Subtle hints for each phrase
}

export async function POST(request: NextRequest) {
    try {
        // Secure authentication - verify Firebase ID token (edge-compatible)
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Fallback for backward compatibility
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: ExerciseBundleRequest = await request.json();
        const { phrases } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'Phrases are required' }, { status: 400 });
        }

        // Strategy 1: If all phrases share a context, use one of their pre-generated questions
        const uniqueContexts = [...new Set(phrases.map(p => p.contextId))];

        if (uniqueContexts.length === 1 && phrases[0].contextQuestion) {
            // Use pre-generated question for this shared context
            return NextResponse.json({
                bundle: {
                    theme: phrases[0].contextName,
                    question: phrases[0].contextQuestion,
                    phrases: phrases.map(p => p.phrase),
                    phraseIds: phrases.map(p => p.phraseId),
                    contextIds: phrases.map(p => p.contextId),
                    hints: phrases.map(p => p.meaning),
                },
                method: 'pregenerated',
            });
        }

        // Strategy 2: Generate a new unified question that works for all phrases
        const phraseList = phrases.map(p => `"${p.phrase}" (${p.meaning})`).join('\n- ');
        const contextList = [...new Set(phrases.map(p => p.contextName))].join(', ');

        const prompt = `Create a thought-provoking question that would naturally require using these phrases to answer well:

Phrases to incorporate:
- ${phraseList}

Context themes: ${contextList}

Requirements:
- Create ONE question that works for ALL these phrases
- The question should require explanation, argumentation, or persuasion (not yes/no)
- It should feel like a real conversation topic or writing prompt
- Users should naturally WANT to use these phrases when answering
- The question should be 1-2 sentences max

Examples of good question types:
- "Why do you think...?"
- "What advice would you give someone who...?"
- "How would you convince someone that...?"
- "What's your take on...?"

Return JSON format:
{
    "theme": "Short theme name (2-4 words)",
    "question": "Your thought-provoking question here?"
}`;

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
                temperature: 0.75,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate exercise' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-exercise',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean markdown code blocks
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            const parseResult = safeParseAIJson<{ theme?: string; question?: string }>(text);
            if (!parseResult.success) throw new Error(parseResult.error);
            const parsed = parseResult.data;

            const bundle: GeneratedBundle = {
                theme: parsed.theme || 'General Practice',
                question: parsed.question || 'How would you use these phrases in a real conversation?',
                phrases: phrases.map(p => p.phrase),
                phraseIds: phrases.map(p => p.phraseId),
                contextIds: phrases.map(p => p.contextId),
                hints: phrases.map(p => p.meaning),
            };

            return NextResponse.json({
                bundle,
                method: 'generated',
            });

        } catch (parseError) {
            console.error('JSON parse error:', parseError);

            // Fallback: simple bundled question
            return NextResponse.json({
                bundle: {
                    theme: 'Practice Session',
                    question: `How would you explain a situation where you might use "${phrases[0]?.phrase}" and the other phrases naturally?`,
                    phrases: phrases.map(p => p.phrase),
                    phraseIds: phrases.map(p => p.phraseId),
                    contextIds: phrases.map(p => p.contextId),
                    hints: phrases.map(p => p.meaning),
                },
                method: 'fallback',
            });
        }

    } catch (error) {
        console.error('Generate exercise error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
