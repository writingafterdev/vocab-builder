import { NextRequest, NextResponse } from 'next/server';
import { runQuery, addDocument, serverTimestamp, setDocument, getDocument, updateDocument } from '@/lib/appwrite/database';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import type { SavedPhrase, AnchorPassage, SessionQuestion, SourcePlatform } from '@/lib/db/types';
import {
    computeSessionSize,
    QUESTION_SKILL_MAP,
    phaseFromStep,
    PHASE_QUESTION_TYPES,
    LISTENING_ELIGIBLE_TYPES,
    type LearningPhase,
    type SessionSize,
} from '@/lib/exercise/config';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

// ─── Source Platforms (for passage variety) ──────────────
const SOURCE_PLATFORMS: SourcePlatform[] = [
    'linkedin', 'reddit', 'email', 'news_oped', 'cover_letter', 'twitter',
];

// ─── Phase-grouped phrases ──────────────
interface PhasedPhrases {
    recognition: SavedPhrase[];
    active_recall: SavedPhrase[];
    production: SavedPhrase[];
}

// ─── Main Handler ─────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json(
                { error: 'AI API key not configured' },
                { status: 500 }
            );
        }

        // Step 1: Get due phrases, grouped by SRS phase
        const { all: duePhrases, phased } = await fetchDuePhrases(userId);

        if (duePhrases.length === 0) {
            return NextResponse.json({
                error: 'No phrases due for review',
                suggestion: 'Keep reading and saving new phrases!',
            }, { status: 400 });
        }

        // Step 2: Get user's weaknesses to weight question types
        let weakTypes: string[] = [];
        try {
            const { getWeakestTypes } = await import('@/lib/db/question-weaknesses');
            weakTypes = await getWeakestTypes(userId, 3);
        } catch {
            // Module may not exist yet — non-fatal
        }

        // Step 3: Pick a random source platform for variety
        const sourcePlatform = SOURCE_PLATFORMS[Math.floor(Math.random() * SOURCE_PLATFORMS.length)];

        // Step 4: Generate passage + phase-aware questions via AI
        const sessionResult = await generateSession(
            duePhrases,
            phased,
            sourcePlatform,
            weakTypes,
            userId,
            request
        );

        if (!sessionResult) {
            return NextResponse.json(
                { error: 'Failed to generate session' },
                { status: 500 }
            );
        }

        // Step 5: Store in Appwrite
        const sessionData = {
            userId,
            title: sessionResult.anchorPassage.topic,
            subtopic: String(sessionResult.anchorPassage.centralClaim).slice(0, 95) + (String(sessionResult.anchorPassage.centralClaim).length > 95 ? '...' : ''),
            content: JSON.stringify(sessionResult.anchorPassage),
            questions: JSON.stringify(sessionResult.questions),
            phrases: JSON.stringify(duePhrases.map(p => p.id)),
            totalPhrases: duePhrases.length,
            status: 'generated',
            createdAt: serverTimestamp(),
        };

        const docId = `session${userId.substring(0, 10)}${Date.now()}`;
        await setDocument('generatedSessions', docId, sessionData);

        // Build phase breakdown for response
        const phaseBreakdown: Record<string, number> = {};
        for (const q of sessionResult.questions) {
            const phase = q.learningPhase || 'recognition';
            phaseBreakdown[phase] = (phaseBreakdown[phase] || 0) + 1;
        }

        return NextResponse.json({
            sessionId: docId,
            topic: sessionResult.anchorPassage.topic,
            centralClaim: sessionResult.anchorPassage.centralClaim,
            questionCount: sessionResult.questions.length,
            phraseCount: duePhrases.length,
            sourcePlatform,
            phaseBreakdown,
            modules: {
                cohesion: sessionResult.questions.filter(q => q.skillAxis === 'cohesion').length,
                naturalness: sessionResult.questions.filter(q => q.skillAxis === 'naturalness').length,
                task_achievement: sessionResult.questions.filter(q => q.skillAxis === 'task_achievement').length,
            },
        });

    } catch (error) {
        console.error('Generate session error:', error);
        return NextResponse.json(
            { error: 'Failed to generate session' },
            { status: 500 }
        );
    }
}

// ─── Fetch Due Phrases (grouped by SRS phase) ────────────────────

async function fetchDuePhrases(userId: string): Promise<{
    all: SavedPhrase[];
    phased: PhasedPhrases;
}> {
    const allPhrases = await runQuery(
        'savedPhrases',
        [{ field: 'userId', op: 'EQUAL', value: userId }],
        100
    ) as unknown as SavedPhrase[];

    if (!allPhrases || allPhrases.length === 0) {
        return { all: [], phased: { recognition: [], active_recall: [], production: [] } };
    }

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const getMs = (t: unknown): number => {
        if (!t) return 0;
        if (typeof t === 'string') return new Date(t).getTime();
        if (typeof t === 'object' && t !== null && 'toMillis' in t &&
            typeof (t as { toMillis: () => number }).toMillis === 'function') {
            return (t as { toMillis: () => number }).toMillis();
        }
        if (t instanceof Date) return t.getTime();
        if (typeof t === 'object' && t !== null && '_seconds' in t) {
            return (t as { _seconds: number })._seconds * 1000;
        }
        return 0;
    };

    const duePhrases = allPhrases.filter(p => {
        const reviewMs = getMs(p.nextReviewDate);
        return reviewMs === 0 || reviewMs <= endOfToday.getTime();
    });

    duePhrases.sort((a, b) => getMs(a.nextReviewDate) - getMs(b.nextReviewDate));

    // Cap at 15 phrases per session
    const capped = duePhrases.slice(0, 15);

    // Group by SRS phase
    const phased: PhasedPhrases = { recognition: [], active_recall: [], production: [] };
    for (const phrase of capped) {
        const phase = phaseFromStep(phrase.learningStep || 0);
        phased[phase].push(phrase);
    }

    return { all: capped, phased };
}

// ─── Build Phase-Aware Prompt Sections ────────────────────

function buildPhasePromptSections(phased: PhasedPhrases, weakTypes: string[], sessionSize: SessionSize): string {
    const sections: string[] = [];

    // Determine which phases are active
    const activePhases: LearningPhase[] = [];
    if (phased.recognition.length > 0) activePhases.push('recognition');
    if (phased.active_recall.length > 0) activePhases.push('active_recall');
    if (phased.production.length > 0) activePhases.push('production');

    // Calculate question count per phase (distribute proportionally)
    const totalPhrases = phased.recognition.length + phased.active_recall.length + phased.production.length;
    const questionBudget: Record<LearningPhase, number> = { recognition: 0, active_recall: 0, production: 0 };
    const totalQ = sessionSize.totalQuestions;

    for (const phase of activePhases) {
        const phrasesInPhase = phased[phase].length;
        questionBudget[phase] = Math.max(1, Math.round((phrasesInPhase / totalPhrases) * totalQ));
    }

    // Adjust to hit exactly totalQ
    let budgetSum = Object.values(questionBudget).reduce((a, b) => a + b, 0);
    while (budgetSum > totalQ) {
        const maxPhase = activePhases.reduce((a, b) => questionBudget[a] >= questionBudget[b] ? a : b);
        questionBudget[maxPhase]--;
        budgetSum--;
    }
    while (budgetSum < totalQ) {
        const maxPhase = activePhases.reduce((a, b) => phased[a].length >= phased[b].length ? a : b);
        questionBudget[maxPhase]++;
        budgetSum++;
    }

    // ── Preamble: excerpt block structure ──
    sections.push(`EXCERPT BLOCK STRUCTURE (CRITICAL):
Instead of giving each question its own passageReference, organize questions into EXCERPT BLOCKS.
- Carve the passage into ${sessionSize.excerptCount} overlapping excerpts (150-250 words each)
- Each excerpt should contain 2-4 of the embedded phrases
- Each excerpt gets ${sessionSize.questionsPerExcerpt} questions that test the phrases within it
- Output format uses "excerptBlocks" array (see JSON format below)

CROSS-PHRASE EXPOSURE: Each excerpt should contain phrases from MULTIPLE phases, giving passive exposure even when the question only tests one phrase.`);

    // Build each phase section
    if (phased.recognition.length > 0) {
        const count = questionBudget.recognition;
        const types = PHASE_QUESTION_TYPES.recognition;
        const phraseList = phased.recognition.map(p =>
            `- "${p.phrase}" (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
        ).join('\n');

        sections.push(`### RECOGNITION QUESTIONS (${count})
Interaction types: ${types.join(', ')}
Primary phrases (SRS steps 0-1, newly encountered):
${phraseList}

Generate ${count} questions across the excerpt blocks.`);
    }

    if (phased.active_recall.length > 0) {
        const count = questionBudget.active_recall;
        const types = PHASE_QUESTION_TYPES.active_recall;
        const phraseList = phased.active_recall.map(p =>
            `- "${p.phrase}" (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
        ).join('\n');

        sections.push(`### ACTIVE RECALL QUESTIONS (${count})
Interaction types: ${types.join(', ')}
Primary phrases (SRS steps 2-3, becoming familiar):
${phraseList}

Generate ${count} questions across the excerpt blocks.`);
    }

    if (phased.production.length > 0) {
        const count = questionBudget.production;
        const types = PHASE_QUESTION_TYPES.production;
        const phraseList = phased.production.map(p =>
            `- "${p.phrase}" [ID: ${p.id}] (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
        ).join('\n');

        sections.push(`### PRODUCTION QUESTIONS (${count})
Interaction types: ${types.join(', ')}
Primary phrases (SRS steps 4-5, approaching mastery):
${phraseList}

PRODUCTION PHRASE TRACKING:
For each freewrite/production question, include:
- "expectedPhrases": 1-3 phrase strings from the Production list
- "expectedPhraseIds": corresponding ID strings
Place production questions in the LAST excerpt block.

Generate ${count} questions.`);
    }

    // Weakness hint
    if (weakTypes.length > 0) {
        sections.push(`\nWEAKNESS TARGETING: The user struggles with: ${weakTypes.join(', ')}. When choosing interaction types within each phase, prefer these.`);
    }

    return sections.join('\n\n');
}


// ─── AI Session Generation ────────────────────────────

async function generateSession(
    duePhrases: SavedPhrase[],
    phased: PhasedPhrases,
    sourcePlatform: SourcePlatform,
    weakTypes: string[],
    userId: string,
    request: NextRequest
): Promise<{
    anchorPassage: AnchorPassage;
    questions: SessionQuestion[];
} | null> {

    const sessionSize = computeSessionSize(duePhrases.length);
    const [minWords, maxWords] = sessionSize.passageWordRange;

    const phraseInventory = duePhrases.map(p => {
        const phase = phaseFromStep(p.learningStep || 0);
        const phaseTag = phase === 'recognition' ? '[RECOGNITION]' : phase === 'active_recall' ? '[ACTIVE_RECALL]' : '[PRODUCTION]';
        return `- "${p.phrase}" ${phaseTag} step=${p.learningStep || 0} (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`;
    }).join('\n');

    const phaseSections = buildPhasePromptSections(phased, weakTypes, sessionSize);

    // ─── PROMPT: Phase-aware passage + questions ───
    const prompt = `You are generating a PHASE-BASED vocabulary exercise session. Questions are organized by the learner's SRS stage — starting with Recognition (easy), progressing to Active Recall (working with it), and ending with Production (free writing).

## STEP 1: ANCHOR PASSAGE

Write a \${minWords}-\${maxWords} word argumentative passage that:
1. Takes a clear, debatable position on a real-world topic
2. Naturally embeds ALL of the following vocabulary phrases (don't force them — weave them into the argument)
3. Contains exactly THREE DELIBERATE FLAWS for students to detect:
   - **Logical gap**: One claim that doesn't follow from its premises
   - **Weak transition**: One sentence-to-sentence connection that feels jumpy
   - **Register break**: One sentence whose tone clashes with the rest
4. Feels like authentic content from a ${sourcePlatform}
5. TONE RULE: Make the tone casual, conversational, internet-slangy, dramatic, or highly opinionated unless the platform STRICTLY demands formality
6. Is intellectually engaging and feels like something a real person wrote this week

VOCABULARY TO EMBED:
${phraseInventory}

## STEP 2: EXCERPT BLOCKS (${sessionSize.excerptCount} excerpts, ${sessionSize.totalQuestions} questions total)

Carve the passage into ${sessionSize.excerptCount} overlapping excerpts (150-250 words each). Each excerpt should contain 2-4 of the embedded phrases from MULTIPLE phases.

For each excerpt, generate ~${sessionSize.questionsPerExcerpt} questions. The learner reads the excerpt once and answers all its questions before moving to the next excerpt.

Place production/freewrite questions in the LAST excerpt block.

${phaseSections}

## QUESTION TYPE FORMATS:

**Recognition (passive, spot-it):**
- \`tone_interpretation\`: "What is the author signaling by writing ___?" → 4 options
- \`inference_bridge\`: "Based on the claim in paragraph 2, which conclusion follows?" → 4 options
- \`spot_intruder\`: "Which sentence breaks the paragraph's unity?" → List 4-5 sentences, one doesn't belong
- \`fallacy_id\`: "The argument in [excerpt] is flawed because..." → 4 options
- \`rate_argument\`: "How strong is this argument?" → 3 options: "Solid" / "Has holes" / "Falls apart"
- \`swipe_judge\`: Provide "swipeCards" array of {text, isNatural} objects — user swipes right for natural, left for unnatural
- \`category_sort\`: "Sort these phrases by [register/connotation/category]" → Provide "categories" array of 2-3 bin labels + "categoryItems" array of {text, correctCategory} where correctCategory is the index into categories
- \`best_response\`: "What's the best response?" → Provide "dialogueTurns" array of {speaker, text} for 2-3 conversation turns + "responseOptions" array of 3 choices + "correctResponseIndex"

**Active Recall (working with it):**
- \`ab_natural\`: Show two versions. "Which sounds more natural?" → 2 options (A/B)
- \`register_sort\`: Show 3-4 sentences. "Rank from most formal to most casual" → items + correctOrder
- \`restructure\`: Show 4-5 scrambled sentences. "Put in logical order" → items + correctOrder
- \`match_pairs\`: Provide "pairs" array of {left, right} objects — user matches them
- \`fill_blank\`: Provide blankSentence with ____, wordBank array, and correctWord
- \`tap_passage\`: Provide tappableSegments array and correctSegmentIndex
- \`build_sentence\`: "Build a natural sentence" → Provide "sentenceChips" array of 5-8 word/phrase chips (SHUFFLED, not in order) + "correctSentence" string
- \`spot_and_fix\`: "Find and fix the error" → Provide "errorSentence" string + "errorSegments" array (sentence split into words) + "errorIndex" (index of wrong word) + "correctFix" (the correction)
- \`cloze_passage\`: "Fill in the blanks" → Provide "clozeText" with __(1)__, __(2)__ etc. markers + "blanks" array of {index, correctWord} + "wordBank" array (correct words + 2-3 distractors, shuffled)

**Production (use it yourself):**
- \`fix_argument\`: "Rewrite this paragraph to fix the logical flaw" → user writes. Include expectedPhrases + expectedPhraseIds.
- \`register_shift\`: "Rewrite this sentence for [different audience]" → user writes. Include expectedPhrases + expectedPhraseIds.
- \`synthesis_response\`: "Take your own position. Use these phrases naturally: [...]" → user writes. Include expectedPhrases + expectedPhraseIds.

## JSON OUTPUT FORMAT:

{
  "anchorPassage": {
    "text": "The full \${minWords}-\${maxWords} word passage",
    "topic": "Short topic label",
    "centralClaim": "The main arguable position in one sentence",
    "deliberateFlaws": {
      "logicalGap": "Description",
      "weakTransition": "Description",
      "registerBreak": "Description"
    },
    "embeddedVocab": ["phrase1", "phrase2"],
    "sourcePlatform": "${sourcePlatform}"
  },
  "excerptBlocks": [
    {
      "excerptId": "ex_1",
      "excerptText": "A 150-250 word overlapping excerpt from the passage...",
      "questions": [
        {
          "id": "q_1",
          "type": "tone_interpretation",
          "skillAxis": "naturalness",
          "learningPhase": "recognition",
          "prompt": "What is the author signaling?",
          "options": ["A", "B", "C", "D"],
          "correctIndex": 2,
          "explanation": "Brief explanation"
        }
      ]
    }
  ]
}

**Required fields per type:**
- \`restructure\`, \`register_sort\`: items + correctOrder (not options/correctIndex)
- \`spot_intruder\`: options (4-5 sentences) + correctIndex
- \`fill_blank\`: blankSentence, wordBank, correctWord
- \`swipe_judge\`: swipeCards [{text, isNatural}]
- \`match_pairs\`: pairs [{left, right}]
- \`tap_passage\`: tappableSegments + correctSegmentIndex
- \`category_sort\`: categories (2-3 labels) + categoryItems [{text, correctCategory}]
- \`best_response\`: dialogueTurns [{speaker, text}] + responseOptions (3 strings) + correctResponseIndex
- \`build_sentence\`: sentenceChips (shuffled words) + correctSentence
- \`spot_and_fix\`: errorSegments (word array) + errorIndex + correctFix
- \`cloze_passage\`: clozeText (with __(N)__ markers) + blanks [{index, correctWord}] + wordBank

Production/freewrite questions go in the LAST excerpt block.`;

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
                        content: 'You are an expert in critical thinking pedagogy and argumentative writing. You create exercises that test reasoning skills — logic, cohesion, register awareness — through authentic content. You respond ONLY in valid JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: Math.max(8000, sessionSize.totalQuestions * 1000),
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'generate-session-article',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parseResult = safeParseAIJson<{
            anchorPassage: AnchorPassage;
            excerptBlocks?: Array<{
                excerptId: string;
                excerptText: string;
                questions: SessionQuestion[];
            }>;
            questions?: SessionQuestion[]; // backward compat
        }>(content);

        if (!parseResult.success) {
            console.error('Failed to parse AI session:', parseResult.error);
            return null;
        }

        const raw = parseResult.data;

        // ─── Validate & clean up ───

        if (!raw.anchorPassage?.text || raw.anchorPassage.text.length < 100) {
            console.error('AI returned empty or too-short passage');
            return null;
        }

        // Ensure passage fields
        raw.anchorPassage.embeddedVocab = raw.anchorPassage.embeddedVocab || [];
        raw.anchorPassage.sourcePlatform = sourcePlatform;
        raw.anchorPassage.deliberateFlaws = raw.anchorPassage.deliberateFlaws || {
            logicalGap: 'Not specified',
            weakTransition: 'Not specified',
            registerBreak: 'Not specified',
        };

        // ─── Flatten excerpt blocks → flat question array ───
        let flatQuestions: SessionQuestion[] = [];

        if (raw.excerptBlocks && raw.excerptBlocks.length > 0) {
            // New format: excerpt blocks
            for (const block of raw.excerptBlocks) {
                const qs = (block.questions || []).map((q, i) => ({
                    ...q,
                    excerptId: block.excerptId,
                    excerptText: block.excerptText,
                    passageReference: block.excerptText, // backward compat
                }));
                flatQuestions.push(...qs);
            }
        } else if (raw.questions) {
            // Backward compat: old flat format
            flatQuestions = raw.questions;
        }

        // Validate and clean each question
        const session = {
            anchorPassage: raw.anchorPassage,
            questions: flatQuestions.map((q, i) => {
                // Derive skillAxis from config if not set correctly by AI
                let rawSkill = (q.skillAxis as string) || 'task_achievement';
                if (rawSkill === 'logic') rawSkill = 'task_achievement';
                if (rawSkill === 'structure') rawSkill = 'cohesion';
                if (rawSkill === 'expression') rawSkill = 'naturalness';

                const configSkill = QUESTION_SKILL_MAP[q.type as keyof typeof QUESTION_SKILL_MAP];

                // Derive learningPhase from question type if AI didn't set it
                let phase = q.learningPhase;
                if (!phase) {
                    if (PHASE_QUESTION_TYPES.production.includes(q.type)) {
                        phase = 'production';
                    } else if (PHASE_QUESTION_TYPES.active_recall.includes(q.type)) {
                        phase = 'active_recall';
                    } else {
                        phase = 'recognition';
                    }
                }

                return {
                    ...q,
                    id: q.id || `q_${i + 1}`,
                    skillAxis: configSkill || rawSkill,
                    learningPhase: phase,
                    explanation: q.explanation || 'No explanation provided.',
                };
            }),
        };

        // Excerpt blocks maintain order naturally (production in last block)
        // Sort WITHIN each excerpt group to push production last, but preserve excerpt ordering
        if (session.questions.some(q => q.excerptId)) {
            // Group by excerptId, maintain group order, sort within each group
            const grouped = new Map<string, typeof session.questions>();
            for (const q of session.questions) {
                const key = q.excerptId || '__ungrouped';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(q);
            }
            session.questions = [];
            for (const [, group] of grouped) {
                group.sort((a, b) => {
                    const pa = a.learningPhase === 'production' ? 1 : 0;
                    const pb = b.learningPhase === 'production' ? 1 : 0;
                    return pa - pb;
                });
                session.questions.push(...group);
            }
        } else {
            // Legacy: simple sort
            session.questions.sort((a, b) => {
                const isProductionA = a.learningPhase === 'production' ? 1 : 0;
                const isProductionB = b.learningPhase === 'production' ? 1 : 0;
                return isProductionA - isProductionB;
            });
        }

        // ─── Deterministic listening mode assignment ───
        const listeningEligible = session.questions.filter(
            q => LISTENING_ELIGIBLE_TYPES.includes(q.type) && q.learningPhase !== 'production'
        );
        if (listeningEligible.length > 0) {
            const pick = listeningEligible[Math.floor(Math.random() * listeningEligible.length)];
            const idx = session.questions.findIndex(q => q.id === pick.id);
            if (idx !== -1) {
                session.questions[idx] = {
                    ...session.questions[idx],
                    isListening: true,
                    listeningText: session.questions[idx].excerptText || session.questions[idx].passageReference || session.questions[idx].prompt,
                };
            }
        }

        console.log(`[Session] Generated: ${session.questions.length} questions across ${new Set(session.questions.map(q => q.excerptId).filter(Boolean)).size} excerpts`);

        return session;

    } catch (error) {
        console.error('AI session generation failed:', error);
        return null;
    }
}


