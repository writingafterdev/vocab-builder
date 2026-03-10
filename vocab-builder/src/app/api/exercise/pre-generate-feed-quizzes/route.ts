import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { DEFAULT_PRACTICE_CONFIG } from '@/lib/db/practice-types';
import { pickDrillWeaknesses, type WeaknessEntry } from '@/lib/db/user-weaknesses';
import type { SavedPhrase, InlineQuestion, ExerciseQuestionType } from '@/lib/db/types';

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Feed-friendly question types: fast, interactive, passive-leaning.
 * These are MCQ-based so users can answer in 2-3 seconds.
 */
const FEED_QUESTION_TYPES: ExerciseQuestionType[] = [
    'situation_phrase_matching',
    'tone_interpretation',
    'appropriateness_judgment',
    'fill_gap_mcq',
    'why_did_they_say',
];

/**
 * POST /api/exercise/pre-generate-feed-quizzes
 *
 * Batch-generates quiz questions for the user's due phrases.
 * These are stored client-side (in-memory) and consumed by
 * useInlineExercise when a quiz slot triggers on the feed.
 *
 * Generates up to 8 questions in a single AI call to minimize latency.
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Step 1: Fetch user's saved phrases (due or recently saved)
        const savedPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            60
        ) as unknown as SavedPhrase[];

        if (!savedPhrases || savedPhrases.length === 0) {
            return NextResponse.json({ questions: [], reason: 'no_saved_phrases' });
        }

        // Step 2: Prioritize — due phrases first, then by staleness
        const now = Date.now();
        const config = DEFAULT_PRACTICE_CONFIG;

        const getMs = (t: unknown): number => {
            if (!t) return 0;
            if (typeof t === 'string') return new Date(t).getTime();
            if (typeof t === 'object' && t !== null && 'toMillis' in t && typeof (t as any).toMillis === 'function') return (t as any).toMillis();
            if (t instanceof Date) return t.getTime();
            return 0;
        };

        // Sort: due first, then least-recently-reviewed
        const sorted = [...savedPhrases].sort((a, b) => {
            const aDue = getMs(a.nextReviewDate) <= now ? 1 : 0;
            const bDue = getMs(b.nextReviewDate) <= now ? 1 : 0;
            if (bDue !== aDue) return bDue - aDue;
            return getMs(a.lastReviewedAt) - getMs(b.lastReviewedAt);
        });

        // Pick top phrases (leave room for drill questions)
        const MAX_TOTAL = 8;

        // Step 3b: Fetch weakness-based drill entries (up to 2)
        let drillEntries: WeaknessEntry[] = [];
        try {
            drillEntries = await pickDrillWeaknesses(userId, 2);
        } catch (e) {
            console.warn('Failed to pick drill weaknesses:', e);
        }

        const phraseSlots = MAX_TOTAL - drillEntries.length;
        const batch = sorted.slice(0, phraseSlots);

        // Step 3: Determine question type for each phrase
        const phraseSpecs = batch.map(p => {
            const step = p.learningStep || 0;
            const isProduction = step >= config.inline.productionThreshold;
            // Feed only uses recognition-phase fast types
            const pool = FEED_QUESTION_TYPES;
            const completedFormats = (p.completedFormats || []) as ExerciseQuestionType[];
            const unused = pool.filter(t => !completedFormats.includes(t));
            const questionType = (unused.length > 0 ? unused : pool)[Math.floor(Math.random() * (unused.length > 0 ? unused : pool).length)];

            return {
                phraseId: p.id,
                phrase: p.phrase,
                meaning: p.meaning || '',
                register: p.register || 'neutral',
                questionType,
                source: 'phrase' as const,
            };
        });

        // Build drill specs from weaknesses
        const drillSpecs = drillEntries.map(w => ({
            phraseId: w.id,
            phrase: w.specific,
            meaning: w.explanation,
            register: 'neutral',
            questionType: 'appropriateness_judgment' as ExerciseQuestionType,
            source: 'drill' as const,
            weaknessCategory: w.category,
            example: w.examples[0] || '',
            correction: w.correction,
        }));

        const allSpecs = [...phraseSpecs, ...drillSpecs];

        // Step 4: Batch-generate via a single AI call
        if (!XAI_API_KEY) {
            // dev fallback: mock questions
            const mockQuestions = allSpecs.map(spec => buildMockFeedQuestion(spec));
            return NextResponse.json({ questions: mockQuestions });
        }

        // Build the prompt — includes both phrase-based and drill-based items
        const phraseLines = phraseSpecs.map((s, i) => 
            `${i + 1}. PHRASE: "${s.phrase}" (meaning: ${s.meaning}, register: ${s.register}, type: ${s.questionType})`
        );
        const drillLines = drillSpecs.map((s, i) => 
            `${phraseSpecs.length + i + 1}. DRILL: weakness in ${s.weaknessCategory} — wrong: "${s.example}", correct: "${s.correction}", explanation: ${s.meaning}`
        );

        const prompt = `Generate ${allSpecs.length} quick-fire vocab questions for a social media-style feed. These pop up between content cards, so they need to be INSTANT FUN — think BuzzFeed quiz energy meets language nerd precision.

Items:
${[...phraseLines, ...drillLines].join('\n')}

For PHRASE items: test if the user truly understands the phrase in a social context.
For DRILL items: test if the user can spot or fix the weakness (e.g. wrong grammar, wrong register, wrong collocation).

Return a JSON object { "questions": [...] } with one entry per item:
{
  "questions": [
    {
      "phraseIndex": 0,
      "scenario": "A punchy scenario (max 35 words). Think: 'Your boss just said this in a meeting...' or 'Someone texts you this at 2am...'",
      "options": ["Option A", "Option B", "Option C"],
      "correctIndex": 0,
      "explanation": "Quick conversational debrief (1 sentence)"
    }
  ]
}

TONE:
- Each scenario should paint a vivid social moment (dinner party, job interview, awkward date, group chat)
- Wrong options should be TEMPTINGLY wrong — the kind of mistake a smart person would make
- Explanations should feel like a friend saying "oh yeah, it actually means..."
- NEVER ask "What does X mean?" — always frame as a social situation
- Keep it snappy — this is a feed, not an exam`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    { role: 'system', content: 'You are a witty language mentor who creates social-situation quiz questions. You think in terms of dinner parties, job interviews, and group chats — not classrooms. Return valid JSON only.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI batch quiz error:', await response.text());
            const fallback = allSpecs.map(spec => buildMockFeedQuestion(spec));
            return NextResponse.json({ questions: fallback });
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content?.trim() || '';

        // Log tokens
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'pre-generate-feed-quizzes',
                model: 'grok-3-mini-fast',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Parse — handle both { questions: [...] } and bare [...]
        const parsed = safeParseAIJson<any>(raw);
        if (!parsed.success) {
            console.error('Batch quiz parse failed');
            const fallback = allSpecs.map(spec => buildMockFeedQuestion(spec));
            return NextResponse.json({ questions: fallback });
        }

        const items: any[] = Array.isArray(parsed.data) ? parsed.data : (parsed.data?.questions || parsed.data?.items || []);

        const questions: InlineQuestion[] = items.map((item: any, i: number) => {
            const idx = item.phraseIndex ?? i;
            const spec = allSpecs[idx] || allSpecs[i];
            if (!spec) return null;

            return {
                id: `prefeed_${spec.phraseId}_${Date.now()}_${i}`,
                phraseId: spec.phraseId,
                phrase: spec.phrase,
                surface: 'quote_swiper' as const,
                phase: 'recognition' as const,
                questionType: spec.questionType,
                scenario: item.scenario || `What does "${spec.phrase}" mean in this context?`,
                options: item.options || [spec.meaning, 'Something else', 'Neither of the above'],
                correctIndex: item.correctIndex ?? 0,
                explanation: item.explanation || spec.meaning,
                xpReward: 10,
                source: spec.source,
            };
        }).filter(Boolean) as InlineQuestion[];

        return NextResponse.json({ questions });

    } catch (error) {
        console.error('Pre-generate feed quizzes error:', error);
        return NextResponse.json(
            { error: 'Failed to pre-generate feed quizzes' },
            { status: 500 }
        );
    }
}

// ─── Mock builder ──────────────────

function buildMockFeedQuestion(spec: {
    phraseId: string;
    phrase: string;
    meaning: string;
    questionType: ExerciseQuestionType;
}): InlineQuestion {
    return {
        id: `mock_feed_${spec.phraseId}_${Date.now()}`,
        phraseId: spec.phraseId,
        phrase: spec.phrase,
        surface: 'quote_swiper',
        phase: 'recognition',
        questionType: spec.questionType,
        scenario: `You come across "${spec.phrase}" in a conversation. What does it convey?`,
        options: [spec.meaning, 'A common but incorrect interpretation', 'An unrelated meaning'],
        correctIndex: 0,
        explanation: spec.meaning,
        xpReward: 10,
    };
}
