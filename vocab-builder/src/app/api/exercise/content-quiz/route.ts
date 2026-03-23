import { NextRequest, NextResponse } from 'next/server';
import { runQuery, updateDocument } from '@/lib/appwrite/database';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import type { SavedPhrase, ExerciseSurface, InlineQuestion, LearningPhase, ExerciseQuestionType } from '@/lib/db/types';
import { DEFAULT_PRACTICE_CONFIG } from '@/lib/db/practice-types';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/exercise/content-quiz
 *
 * Generates a quiz question based on the CURRENT content the user is reading.
 * 1. Receives the content text (quote text / article section)
 * 2. Scans for user's saved phrases within the text
 * 3. Picks one that's due for review (or least recently reviewed)
 * 4. Generates a question using the content as context
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
        const {
            contentText,
            surface,
            highlightedPhrases,
        }: {
            contentText: string;
            surface: ExerciseSurface;
            highlightedPhrases?: string[];
        } = body;

        if (!contentText) {
            return NextResponse.json({ question: null, reason: 'no_content' });
        }

        // Step 1: Get all user's saved phrases
        const savedPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            100
        ) as unknown as SavedPhrase[];

        if (!savedPhrases || savedPhrases.length === 0) {
            return NextResponse.json({ question: null, reason: 'no_saved_phrases' });
        }

        // Step 2: Find which saved phrases appear in this content
        const contentLower = contentText.toLowerCase();
        const matchingPhrases = savedPhrases.filter(p => {
            // Check if phrase appears in the content text
            if (contentLower.includes(p.phrase.toLowerCase())) return true;
            // Also check highlighted phrases from the article/quote
            if (highlightedPhrases?.some(hp =>
                hp.toLowerCase() === p.phrase.toLowerCase()
            )) return true;
            return false;
        });

        if (matchingPhrases.length === 0) {
            return NextResponse.json({ question: null, reason: 'no_phrase_in_content' });
        }

        // Step 3: Prioritize — due phrases first, then by staleness
        const now = new Date();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();

        const getMs = (t: unknown): number => {
            if (!t) return 0;
            if (typeof t === 'string') return new Date(t).getTime();
            if (typeof t === 'object' && t !== null && 'toMillis' in t && typeof (t as { toMillis: () => number }).toMillis === 'function') return (t as { toMillis: () => number }).toMillis();
            if (t instanceof Date) return t.getTime();
            return 0;
        };

        // Filter out phrases already reviewed today
        const notReviewedToday = matchingPhrases.filter(p => {
            const lastReviewMs = getMs(p.lastReviewedAt);
            return lastReviewMs < todayStartMs;
        });

        // Use notReviewedToday if available, otherwise all matching (fallback)
        const pool = notReviewedToday.length > 0 ? notReviewedToday : matchingPhrases;

        // Sort: due phrases first, then failed inline, then by staleness
        pool.sort((a, b) => {
            // Due phrases first
            const aDue = getMs(a.nextReviewDate) <= now.getTime() ? 1 : 0;
            const bDue = getMs(b.nextReviewDate) <= now.getTime() ? 1 : 0;
            if (bDue !== aDue) return bDue - aDue;

            // Failed inline phrases next
            if (a.failedInline && !b.failedInline) return -1;
            if (!a.failedInline && b.failedInline) return 1;

            // Then by least recently reviewed (stalest first)
            return getMs(a.lastReviewedAt) - getMs(b.lastReviewedAt);
        });

        const phrase = pool[0];
        const reviewCount = phrase.learningStep || 0;
        const config = DEFAULT_PRACTICE_CONFIG;

        // Determine phase and format
        const phase: LearningPhase = reviewCount < config.inline.productionThreshold
            ? 'recognition'
            : 'production';

        const completedFormats = phrase.completedFormats || [];
        const questionType = pickNextFormat(completedFormats as ExerciseQuestionType[], surface, phase);

        // Step 4: Generate question using content as context
        const question = await generateContentQuestion({
            phrase,
            contentText,
            surface,
            questionType,
            phase,
            userId,
            request,
        });

        // Mark as served (prevent double-serving)
        try {
            await updateDocument('savedPhrases', phrase.id, {
                lastReviewedAt: new Date().toISOString(),
                lastReviewSource: surface,
            });
        } catch (e) {
            console.warn('Failed to mark phrase as served:', e);
        }

        return NextResponse.json({ question });

    } catch (error) {
        console.error('Content quiz error:', error);
        return NextResponse.json({ error: 'Failed to generate content quiz' }, { status: 500 });
    }
}

// ============================================================================
// AI QUESTION GENERATION
// ============================================================================

async function generateContentQuestion(params: {
    phrase: SavedPhrase;
    contentText: string;
    surface: ExerciseSurface;
    questionType: ExerciseQuestionType;
    phase: LearningPhase;
    userId: string;
    request: NextRequest;
}): Promise<InlineQuestion> {
    const { phrase, contentText, surface, questionType, phase, userId, request } = params;

    // Fallback: build mock question if no API key
    if (!XAI_API_KEY) {
        return buildMockQuestion({ phrase, contentText, surface, questionType, phase });
    }

    // Trim content to keep tokens manageable
    const trimmedContent = contentText.slice(0, 500);

    const prompt = `You just saw a learner reading this passage:

---
"${trimmedContent}"
---

Their target phrase is: "${phrase.phrase}"
It means: ${phrase.meaning || 'contextual'}
Register: ${phrase.register || 'any'}

${phase === 'recognition' ? `Generate a "${questionType}" question. Make it feel like a sharp, knowing remark from a friend who's also a language nerd — NOT a textbook exercise.

TONE RULES:
- Write like you're texting a smart friend, not lecturing a student
- Reference specific details from the passage — don't be generic
- Make the scenario feel like a real moment someone would encounter
- Wrong options should be TEMPTING — the kind of mistake a smart person would make

Return JSON:
{
  "scenario": "A punchy 1-2 sentence scenario that references the content above. Think: 'You're at a dinner party and someone says...' not 'What does X mean?'",
  "options": ["Option A", "Option B", "Option C"],
  "correctIndex": 0,
  "explanation": "Brief, conversational explanation — like you're debriefing with a friend"
}

AVOID:
- "What does X mean in this context?" (boring)
- "Which of the following best describes..." (textbook)
- Generic scenarios that ignore the content

GO FOR:
- "Your colleague just used '${phrase.phrase}' in a meeting. What are they really saying?"
- "If someone said this to you at a bar, they probably mean..."
- Scenarios that make the reader FEEL the social situation` : `Generate a "${questionType}" open-ended question. Make it feel like a creative writing prompt from a master class — not a fill-in-the-blank worksheet.

Return JSON:
{
  "scenario": "A vivid 1-2 sentence setup inspired by the passage (think: character, tension, stakes)",
  "prompt": "A specific creative instruction that REQUIRES using the phrase naturally",
  "explanation": "What a genuinely impressive answer would sound like"
}`}`;


    try {
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
                        content: 'You are a witty language mentor — part teacher, part sharp-eyed friend. You notice social nuances most people miss, and your questions make people think about HOW language works in real situations, not just what words mean. Return JSON only.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 400,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI API error:', await response.text());
            return buildMockQuestion({ phrase, contentText, surface, questionType, phase });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: userId || 'anonymous',
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'content-quiz',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parseResult = safeParseAIJson<{
            scenario: string;
            options?: string[];
            correctIndex?: number;
            explanation?: string;
            prompt?: string;
        }>(content);

        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            return buildMockQuestion({ phrase, contentText, surface, questionType, phase });
        }

        const parsed = parseResult.data;

        return {
            id: `content_${phrase.id}_${Date.now()}`,
            phraseId: phrase.id,
            phrase: phrase.phrase,
            surface,
            phase,
            questionType,
            scenario: parsed.scenario || `Based on what you just read, what does "${phrase.phrase}" mean?`,
            options: parsed.options,
            correctIndex: parsed.correctIndex,
            prompt: parsed.prompt,
            explanation: parsed.explanation || phrase.meaning,
            xpReward: phase === 'recognition' ? 10 : 15,
        };
    } catch (error) {
        console.error('AI generation failed:', error);
        return buildMockQuestion({ phrase, contentText, surface, questionType, phase });
    }
}

// ============================================================================
// MOCK BUILDER (dev / fallback)
// ============================================================================

function buildMockQuestion(params: {
    phrase: SavedPhrase;
    contentText: string;
    surface: ExerciseSurface;
    questionType: ExerciseQuestionType;
    phase: LearningPhase;
}): InlineQuestion {
    const { phrase, contentText, surface, questionType, phase } = params;
    const snippet = contentText.slice(0, 120).replace(/\n/g, ' ').trim();
    const isRecognition = phase === 'recognition';

    return {
        id: `mock_${phrase.id}_${Date.now()}`,
        phraseId: phrase.id,
        phrase: phrase.phrase,
        surface,
        phase,
        questionType,
        scenario: isRecognition
            ? `In the passage "${snippet}...", what does "${phrase.phrase}" convey?`
            : `Based on what you just read about "${snippet}...", use "${phrase.phrase}" in your own sentence.`,
        options: isRecognition
            ? [phrase.meaning || 'The correct meaning', 'A common but incorrect interpretation', 'An unrelated meaning']
            : undefined,
        correctIndex: isRecognition ? 0 : undefined,
        prompt: !isRecognition
            ? `Write a 1-2 sentence response using "${phrase.phrase}" naturally.`
            : undefined,
        explanation: phrase.meaning || `"${phrase.phrase}" is used in this context to convey a specific nuance.`,
        xpReward: isRecognition ? 10 : 15,
    };
}

// ============================================================================
// FORMAT SELECTION
// ============================================================================

const FAST_RECOGNITION: ExerciseQuestionType[] = [
    'situation_phrase_matching',
    'tone_interpretation',
    'contrast_exposure',
    'appropriateness_judgment',
    'fill_gap_mcq',
];

const ALL_RECOGNITION: ExerciseQuestionType[] = [
    'social_consequence_prediction',
    'situation_phrase_matching',
    'tone_interpretation',
    'contrast_exposure',
    'why_did_they_say',
    'appropriateness_judgment',
    'error_detection',
    'fill_gap_mcq',
    'register_sorting',
    'reading_comprehension',
    'sentence_correction',
];

const PRODUCTION: ExerciseQuestionType[] = [
    'constrained_production',
    'transformation_exercise',
    'dialogue_completion_open',
    'text_completion',
    'scenario_production',
    'multiple_response_generation',
    'explain_to_friend',
    'creative_context_use',
];

function getFormatsForSurface(surface: ExerciseSurface, phase: LearningPhase): ExerciseQuestionType[] {
    switch (surface) {
        case 'quote_swiper':
        case 'action_gate':
        case 'dead_time':
            return FAST_RECOGNITION;
        case 'swipe_reader':
            return ALL_RECOGNITION;
        case 'full_article':
        case 'exercises_page':
            return phase === 'recognition' ? ALL_RECOGNITION : PRODUCTION;
        default:
            return FAST_RECOGNITION;
    }
}

function pickNextFormat(
    completedFormats: ExerciseQuestionType[],
    surface: ExerciseSurface,
    phase: LearningPhase
): ExerciseQuestionType {
    const available = getFormatsForSurface(surface, phase);
    const unused = available.filter(f => !completedFormats.includes(f));
    const pool = unused.length > 0 ? unused : available;
    return pool[Math.floor(Math.random() * pool.length)];
}
