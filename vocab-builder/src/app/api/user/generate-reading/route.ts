import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { updateDocument, addDocument, serverTimestamp } from '@/lib/firestore-rest';

import { safeParseAIJson } from '@/lib/ai-utils';

/**
 * Generate a Substack-style reading article containing target phrases
 * Used for passive review exercises
 */

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_API_KEY = process.env.XAI_API_KEY;

interface PhraseInput {
    id?: string;           // Optional: phrase ID for tracking
    phrase: string;
    meaning: string;
    potentialUsages?: Array<{
        phrase: string;
        meaning: string;
        type: string;
    }>;
}

interface GenerateReadingRequest {
    phrases: PhraseInput[];
    clusterContext?: {
        theme: string;
        context: string;
        pragmatics: {
            register: string;
            relationship: string;
        };
    };
}

interface ComprehensionQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    type: string;
    vocabItemsTested: string[];
    explanation?: string;
}

interface RelatedExpression {
    phrase: string;
    meaning: string;
    type: string;
    parentPhrase: string;
    parentPhraseId?: string;
}

interface GeneratedArticle {
    title: string;
    content: string;
    questions: ComprehensionQuestion[];
    relatedExpressions: RelatedExpression[];
}

export async function POST(request: NextRequest) {
    try {
        // ... (auth checks) ...
        // Secure authentication - verify Firebase ID token (edge-compatible)
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Robust Fallback for Local Dev / Testing
        const userId = authUser?.userId || request.headers.get('x-user-id');
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email') || 'local-dev@example.com';

        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: GenerateReadingRequest = await request.json();
        const { phrases, clusterContext } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        // Build phrase list for prompt
        const phraseList = phrases.map((p, i) =>
            `${i + 1}. "${p.phrase}" (meaning: ${p.meaning})`
        ).join('\n');

        // ... (related expressions logic) ...
        const allRelatedExpressions: RelatedExpression[] = [];
        phrases.forEach(p => {
            if (p.potentialUsages?.length) {
                p.potentialUsages.forEach(usage => {
                    allRelatedExpressions.push({
                        phrase: usage.phrase,
                        meaning: usage.meaning,
                        type: usage.type,
                        parentPhrase: p.phrase,
                        parentPhraseId: p.id,
                    });
                });
            }
        });

        // Build related expressions list
        const relatedList = allRelatedExpressions.length > 0
            ? `\n\nADDITIONAL RELATED EXPRESSIONS to naturally weave in:\n${allRelatedExpressions.map(r =>
                `- "${r.phrase}" (${r.type})`
            ).join('\n')}\nTry to include 2-3 of these naturally.`
            : '';

        let finalPrompt = '';

        if (clusterContext) {
            // SCENARIO-DRIVEN MODE - Simple, everyday scenarios
            finalPrompt = `Write a SHORT, SIMPLE dialogue or conversation snippet (300-500 words).

CONTEXT:
- SETTING: ${clusterContext.context || clusterContext.theme}
- TONE: ${clusterContext.pragmatics.register} (${clusterContext.pragmatics.register === 'formal' ? 'polite, professional' : 'relaxed, natural'})
- RELATIONSHIP: ${clusterContext.pragmatics.relationship}

VOCABULARY TO INCLUDE:
${phraseList}${relatedList}

KEEP IT SIMPLE:
- A quick chat between friends
- A casual text exchange
- A brief workplace conversation
- An everyday situation (coffee shop, grocery store, etc.)

RULES:
- **NO DRAMA**: Avoid complex plots, conflicts, or twists.
- **NATURAL**: Just normal people talking about normal things.
- **SHOW, DON'T TELL**: Don't define words. Let context reveal meaning.
- **SHORT**: 300-500 words max.`;

        } else {
            // FALLBACK MODE (no cluster context)
            finalPrompt = `Write a SHORT, CASUAL conversation (300-500 words) between friends using these phrases:

${phraseList}${relatedList}

KEEP IT SIMPLE: Just a normal everyday chat. No drama, no complex plot.`;
        }

        // QUESTION DESIGN SECTION (always appended)
        finalPrompt += `

---
AFTER THE STORY, CREATE ${Math.min(phrases.length + 2, 6)} COMPREHENSION QUESTIONS.

**QUESTION DESIGN PRINCIPLES (CRITICAL):**

1. **CONTENT-FIRST**: Questions ask about STORY (people, events, motivations), NOT vocabulary.
   - BAD: "What does 'weigh the decision' mean?"
   - GOOD: "Why did Sarah hesitate before accepting the offer?" (requires understanding 'weigh the decision')

2. **LAYERED TESTING**: Each question should test 2-3 vocab items through interconnected story logic.

3. **QUESTION TYPES (use variety):**
   - **Character Motivation**: "Why was Maria concerned about X?"
   - **Outcome/Consequence**: "What went wrong when X?"
   - **Turning Point**: "What changed Y's mind?"
   - **Communication Intent**: "What was Lisa trying to tell Z without being rude?"
   - **Relationship Dynamics**: "Why did Sarah's tone change?"

4. **WRONG ANSWER DESIGN**: Wrong answers should be plausible but reveal specific vocab misunderstandings.

**OUTPUT JSON FORMAT:**
{
    "title": "Catchy, specific title",
    "content": "Full story text with paragraph breaks...",
    "questions": [
        {
            "question": "Question about story (not vocabulary)",
            "type": "character_motivation",
            "options": ["Wrong A", "Wrong B", "Correct C", "Wrong D"],
            "correctIndex": 2,
            "vocabItemsTested": ["phrase1", "phrase2"],
            "explanation": "Why correct answer requires understanding these phrases"
        }
    ]
}

Return ONLY valid JSON, no markdown.`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: finalPrompt }],
                max_tokens: 4000,
                temperature: 0.8,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate article' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        // userId is already defined above
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-reading',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean markdown code blocks
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            const parseResult = safeParseAIJson<any>(text);
            if (!parseResult.success) throw new Error(parseResult.error);
            const parsed = parseResult.data;

            // Validate structure
            if (!parsed.title || !parsed.content || !parsed.questions) {
                throw new Error('Invalid response structure');
            }

            // Add relatedExpressions to the article for UI highlighting
            const articleWithRelated: GeneratedArticle = {
                ...parsed,
                relatedExpressions: allRelatedExpressions,
            };

            // Mark root phrases as appeared in exercise
            const phraseIdsToMark = phrases.filter(p => p.id).map(p => p.id!);
            phraseIdsToMark.forEach(id => {
                updateDocument('savedPhrases', id, { hasAppearedInExercise: true })
                    .catch(err => console.error('Failed to mark phrase appearance:', id, err));
            });

            // Build usagesIncluded for client to pass to promote-usages on completion
            const usagesIncluded = allRelatedExpressions
                .filter(expr => expr.parentPhraseId)
                .slice(0, 4)  // Limit to 2 per parent (roughly 4 total for 2 phrases)
                .map(expr => ({
                    parentPhraseId: expr.parentPhraseId!,
                    parentPhrase: expr.parentPhrase,
                    usage: {
                        phrase: expr.phrase,
                        meaning: expr.meaning,
                        type: expr.type,
                    },
                }));

            // NOTE: Promotion moved to completion via promote-usages API
            // Client should call promote-usages with usagesIncluded when user completes reading

            return NextResponse.json({
                article: articleWithRelated,
                phraseCount: phrases.length,
                questionCount: parsed.questions.length,
                relatedCount: allRelatedExpressions.length,
                usagesIncluded,  // Client passes this to promote-usages on completion
                success: true,
            });

        } catch (parseError) {
            console.error('JSON parse error:', parseError);

            // Fallback: try to extract content manually
            return NextResponse.json({
                article: {
                    title: 'Reading Practice',
                    content: text,
                    questions: [],
                    relatedExpressions: allRelatedExpressions,
                },
                phraseCount: phrases.length,
                questionCount: 0,
                relatedCount: allRelatedExpressions.length,
                success: true,
                fallback: true,
            });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Generate reading CRITICAL ERROR:', errorMessage);
        return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
    }
}
