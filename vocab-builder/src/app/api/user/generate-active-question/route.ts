import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { safeParseAIJson } from '@/lib/ai-utils';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface PhraseToTest {
    phraseId: string;
    phrase: string;
    meaning: string;
    step?: number; // SRS step (0 = new, 1+ = review)
}

interface GenerateActiveQuestionRequest {
    phrases: PhraseToTest[];  // 2-3 phrases bundled per question
    questionType?: 'production' | 'mcq_comprehension'; // Optional: Auto-selected if omitted
    contextTopic?: string;
    setting?: string;
    role?: string;
}

/**
 * Generate content-focused active practice questions that test MULTIPLE phrases:
 * - production: User writes about a situation using all target phrases
 * - mcq_comprehension: User must understand all phrases to answer correctly
 * 
 * DIFFICULTY AUTO-SELECTION:
 * - If any phrase has step 0 (New) → Force MCQ
 * - Otherwise → Production
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email') || '';
        const userId = authUser?.userId || request.headers.get('x-user-id') || '';

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: GenerateActiveQuestionRequest = await request.json();
        let { phrases, questionType } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'phrases array required' }, { status: 400 });
        }

        // AUTO-SELECT QUESTION TYPE based on phrase steps
        if (!questionType) {
            // If ANY phrase is step 0 (new), use MCQ for gentler introduction
            const hasNewPhrases = phrases.some(p => (p.step ?? 0) === 0);
            questionType = hasNewPhrases ? 'mcq_comprehension' : 'production';
        }

        const phraseList = phrases.map(p => `"${p.phrase}" (${p.meaning})`).join('\n- ');
        const phraseNames = phrases.map(p => p.phrase).join(', ');

        let prompt = '';

        if (questionType === 'production') {
            // New Hierarchical Context
            const setting = body.setting || 'General Context';
            const role = body.role || 'Listener';

            prompt = `Generate a GUIDED ROLE-PLAY SCENARIO (Director Mode).

TARGET PHRASES (User must use ALL):
- ${phraseList}

CONTEXT SETTING: ${setting}
RELATIONSHIP DYNAMIC: User is talking to a ${role}.

Create a specific "Moment" in a conversation where the user needs to achieve a specific COMMUNICATIVE GOAL using the target phrases.

1. **The Scene**: Brief context (e.g., "You are at a coffee shop with Sarah...").
2. **The AI Character (${role})**: Needs to say something that CREATES A PROBLEM or OPENING for the user.
3. **The User's Goal**: A specific instruction for *what meaning* to convey (NOT just "use the phrases").

Return JSON:
{
    "scenario": "The Scene description...",
    "aiCharacter": "Name/Role",
    "aiOpeningLine": "The line that sets up the goal (e.g., 'I'm so stressed about this decision!')",
    "communicativeGoal": "The specific instruction (e.g., 'Tell her not to rush. Suggest she takes some time to think.')",
    "phrasesToUse": ["${phrases.map(p => p.phrase).join('", "')}"],
    "sampleResponse": "A natural response achieving the goal",
    "evaluationCriteria": ["Politeness", "Pragmatic Appropriateness"]
}

RULES:
- \`communicativeGoal\` must be an instruction (starts with "Tell her...", "Ask him...", "Explain...").
- \`aiOpeningLine\` must make the goal necessary.
- Do NOT give away the exact words in the goal, just the *intent*.`;
        }
        else if (questionType === 'mcq_comprehension') {
            prompt = `Generate a CONTENT-FOCUSED MCQ that requires understanding MULTIPLE phrases to answer correctly.

TARGET PHRASES (user must understand ALL to answer):
- ${phraseList}

Create a scenario or passage where understanding these phrases is ESSENTIAL to answering the question.
The question should test COMPREHENSION of the phrases' meanings in context.

Return JSON:
{
    "passage": "A 3-4 sentence passage that uses all target phrases naturally in context",
    "question": "A comprehension question that can only be answered by understanding the phrases",
    "testedPhrases": ["${phrases.map(p => p.phrase).join('", "')}"],
    "options": [
        { "text": "Option A", "isCorrect": false, "explanation": "Why wrong" },
        { "text": "Option B", "isCorrect": true, "explanation": "Why correct - connects to phrase meanings" },
        { "text": "Option C", "isCorrect": false, "explanation": "Why wrong" },
        { "text": "Option D", "isCorrect": false, "explanation": "Why wrong" }
    ]
}

RULES:
- Passage uses all phrases naturally (not awkwardly forced)
- Question tests UNDERSTANDING of the phrases, not just recognition
- Correct answer requires knowing what the phrases MEAN
- Wrong answers should be plausible if you don't understand the phrases
- Shuffle correct answer position`;
        }

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.7,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate question' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-active-question',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean and parse JSON
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const parseResult = safeParseAIJson(text);
        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            return NextResponse.json({ error: 'AI returned invalid format' }, { status: 502 });
        }
        const parsed = parseResult.data;

        return NextResponse.json({
            questionType,
            phrases: phrases.map(p => ({ phraseId: p.phraseId, phrase: p.phrase })),
            ...(parsed as Record<string, unknown>),
        });

    } catch (error) {
        console.error('Generate active question error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
