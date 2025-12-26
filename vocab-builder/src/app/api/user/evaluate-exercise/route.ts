import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Evaluate bundled exercise responses
 * Checks if user naturally incorporated the required phrases
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface EvaluateBundleRequest {
    question: string;
    userResponse: string;
    phrases: string[];
    phraseIds: string[];
    contextIds: string[];
}

interface PhraseResult {
    phrase: string;
    phraseId: string;
    contextId: string;
    status: 'natural' | 'forced' | 'missing';
    feedback: string;
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: EvaluateBundleRequest = await request.json();
        const { question, userResponse, phrases, phraseIds, contextIds } = body;

        if (!userResponse || !phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Initialize phrase results
        const phraseResults: PhraseResult[] = phrases.map((phrase, i) => ({
            phrase,
            phraseId: phraseIds[i] || '',
            contextId: contextIds[i] || '',
            status: userResponse.toLowerCase().includes(phrase.toLowerCase()) ? 'forced' : 'missing',
            feedback: '',
        }));

        // AI evaluation for natural usage
        if (DEEPSEEK_API_KEY) {
            try {
                const phraseListForPrompt = phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n');

                const prompt = `Evaluate if each phrase was used NATURALLY in this response.

Question: "${question}"

Response: "${userResponse}"

Phrases to check:
${phraseListForPrompt}

For each phrase, determine:
- "natural": Used correctly and sounds like a native speaker would use it
- "forced": Present but awkward, grammatically wrong, or doesn't fit the context
- "missing": Not used at all

IMPORTANT: For "forced" phrases, EXPLAIN WHY it sounds unnatural (e.g., wrong grammar, wrong context, sounds translated, etc.)
For "missing" phrases, give a SHORT example of how to use it naturally.

Return JSON only:
{
    "phrases": [
        {"phrase": "phrase text", "status": "natural", "feedback": "Good use!"},
        {"phrase": "phrase text", "status": "forced", "feedback": "This sounds awkward because... A more natural way would be..."},
        {"phrase": "phrase text", "status": "missing", "feedback": "You could say: [example sentence]"}
    ]
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
                        max_tokens: 600,
                        temperature: 0.3,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    let text = data.choices?.[0]?.message?.content || '';

                    // Log token usage
                    const userId = request.headers.get('x-user-id') || 'anonymous';
                    if (data.usage) {
                        logTokenUsage({
                            userId,
                            userEmail,
                            endpoint: 'evaluate-exercise',
                            model: 'deepseek-chat',
                            promptTokens: data.usage.prompt_tokens || 0,
                            completionTokens: data.usage.completion_tokens || 0,
                            totalTokens: data.usage.total_tokens || 0,
                        });
                    }

                    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.phrases && Array.isArray(parsed.phrases)) {
                            parsed.phrases.forEach((aiResult: { phrase: string; status: string; feedback: string }) => {
                                const match = phraseResults.find(pr =>
                                    pr.phrase.toLowerCase() === aiResult.phrase.toLowerCase()
                                );
                                if (match) {
                                    match.status = aiResult.status as 'natural' | 'forced' | 'missing';
                                    match.feedback = aiResult.feedback || '';
                                }
                            });
                        }
                    } catch (parseError) {
                        console.error('JSON parse error:', parseError);
                    }
                }
            } catch (aiError) {
                console.error('AI evaluation error:', aiError);
            }
        }

        // Count results
        const naturalCount = phraseResults.filter(p => p.status === 'natural').length;
        const forcedCount = phraseResults.filter(p => p.status === 'forced').length;
        const missingCount = phraseResults.filter(p => p.status === 'missing').length;

        // Determine if passed (at least half used naturally)
        const passed = naturalCount >= Math.ceil(phrases.length / 2);

        return NextResponse.json({
            success: true,
            phraseResults,
            summary: {
                natural: naturalCount,
                forced: forcedCount,
                missing: missingCount,
                total: phrases.length,
            },
            passed,
        });

    } catch (error) {
        console.error('Evaluate exercise error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
