import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { fetchWithKeyRotation } from '@/lib/api-key-rotation';
import {
    ExerciseSessionType,
    ExerciseQuestionType,
    ExerciseQuestion,
    ExerciseStoryContext,
    ExerciseSession,
    ExerciseQuestionContent,
    Register,
} from '@/lib/db/types';

/**
 * Generate an exercise session with story context and questions
 * Supports quick_practice, story, and listening session types
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

interface PhraseInput {
    id: string;
    phrase: string;
    meaning: string;
    register?: Register | Register[];
    learningStep?: number;
    potentialUsages?: Array<{
        phrase: string;
        meaning: string;
        type: string;
        exposed?: boolean;
    }>;
}

interface GenerateSessionRequest {
    sessionType: ExerciseSessionType;
    testedPhrases: PhraseInput[];     // Phrases to TEST (due today)
    contextPhrases: PhraseInput[];     // Phrases for CONTEXT only (not tested)
    clusterContext: {
        theme: string;
        setting?: string;
        pragmatics?: {
            register: string;
            relationship: string;
        };
    };
}

import {
    QUESTION_TYPE_PROGRESSION,
    getPhase,
    RECOGNITION_PROMPTS,
    COMPREHENSION_PROMPTS,
    GUIDED_PRODUCTION_PROMPTS,
    MASTERY_PROMPTS,
    QUESTION_QUALITY_PREAMBLE,
} from '@/lib/prompts/question-prompts';

/**
 * Question types that support multiple phrases in one question
 */
const MULTI_PHRASE_TYPES: Record<ExerciseQuestionType, { minPhrases: number; maxPhrases: number } | null> = {
    // Types that work well with 2+ phrases
    'contrast_exposure': { minPhrases: 2, maxPhrases: 2 },
    'register_sorting': { minPhrases: 2, maxPhrases: 4 },
    'situation_phrase_matching': { minPhrases: 1, maxPhrases: 3 },
    'appropriateness_judgment': { minPhrases: 1, maxPhrases: 2 },

    // Single-phrase only types
    'social_consequence_prediction': null,
    'tone_interpretation': null,
    'why_did_they_say': null,
    'error_detection': null,
    'fill_gap_mcq': null,
    'constrained_production': null,
    'transformation_exercise': null,
    'dialogue_completion_open': null,
    'scenario_production': null,
    'multiple_response_generation': null,
    'explain_to_friend': null,
    'creative_context_use': null,
    'story_intro': null,
    'listen_select': null,
    'type_what_you_hear': null,
    'reading_comprehension': null,
    'sentence_correction': null,
    'text_completion': { minPhrases: 2, maxPhrases: 3 },
};

/**
 * Group phrases by their learningStep
 */
function groupByStep(phrases: PhraseInput[]): Map<number, PhraseInput[]> {
    const groups = new Map<number, PhraseInput[]>();
    for (const p of phrases) {
        const step = p.learningStep || 1;
        if (!groups.has(step)) groups.set(step, []);
        groups.get(step)!.push(p);
    }
    return groups;
}

/**
 * Weighted random selection from allowed types
 */
function weightedRandom(types: Array<{ type: ExerciseQuestionType; weight: number }>): ExerciseQuestionType {
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const t of types) {
        if (random < t.weight) return t.type;
        random -= t.weight;
    }

    return types[types.length - 1].type;
}

/**
 * Question assignment with phrase(s) and type
 */
interface QuestionAssignment {
    type: ExerciseQuestionType;
    phrases: PhraseInput[];
    phase: string;
}

/**
 * Select questions using PER-PHRASE learningStep with multi-phrase merging
 * 
 * Algorithm:
 * 1. Group phrases by learningStep
 * 2. For each group, determine phase and allowed types
 * 3. For groups with 2+ phrases, prefer multi-phrase types (contrast, sorting)
 * 4. Generate single-phrase questions for remaining
 */
function selectQuestionsForPhrases(
    sessionType: ExerciseSessionType,
    phrases: PhraseInput[]
): QuestionAssignment[] {
    // Story/listening sessions use fixed sequence
    if (sessionType === 'story' || sessionType === 'listening') {
        const types = sessionType === 'story'
            ? ['story_intro', 'fill_gap_mcq', 'why_did_they_say', 'situation_phrase_matching', 'social_consequence_prediction']
            : ['story_intro', 'listen_select', 'tone_interpretation', 'type_what_you_hear', 'appropriateness_judgment'];

        return types.map((type, i) => ({
            type: type as ExerciseQuestionType,
            phrases: [phrases[i % phrases.length]],
            phase: 'story',
        }));
    }

    // Group phrases by learning step
    const stepGroups = groupByStep(phrases);
    const assignments: QuestionAssignment[] = [];

    for (const [step, groupPhrases] of stepGroups) {
        const phase = getPhase(step);
        const config = QUESTION_TYPE_PROGRESSION[phase];

        // Track remaining phrases to assign
        let remaining = [...groupPhrases];

        // Step 1: Try to create multi-phrase questions for groups of 2+
        if (remaining.length >= 2) {
            // Find multi-phrase types allowed in this phase
            const multiTypes = config.allowedTypes.filter(t => {
                const multiConfig = MULTI_PHRASE_TYPES[t.type];
                return multiConfig && multiConfig.minPhrases >= 2;
            });

            if (multiTypes.length > 0) {
                // Use contrast_exposure or register_sorting for pair
                const multiType = weightedRandom(multiTypes);
                const multiConfig = MULTI_PHRASE_TYPES[multiType]!;
                const count = Math.min(remaining.length, multiConfig.maxPhrases);

                assignments.push({
                    type: multiType,
                    phrases: remaining.slice(0, count),
                    phase: config.phase,
                });

                remaining = remaining.slice(count);
            }
        }

        // Step 2: Assign remaining phrases to single-phrase questions
        for (const phrase of remaining) {
            // Get single-phrase types (exclude multi-phrase-only types)
            const singleTypes = config.allowedTypes.filter(t => {
                const multiConfig = MULTI_PHRASE_TYPES[t.type];
                return !multiConfig || multiConfig.minPhrases === 1;
            });

            const type = weightedRandom(singleTypes.length > 0 ? singleTypes : config.allowedTypes);

            assignments.push({
                type,
                phrases: [phrase],
                phase: config.phase,
            });
        }
    }

    // Shuffle to mix different phases
    for (let i = assignments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
    }

    return assignments;
}

/**
 * Legacy function for backward compatibility
 */
function selectQuestionTypes(
    sessionType: ExerciseSessionType,
    avgStep: number
): ExerciseQuestionType[] {
    const phase = getPhase(avgStep);
    const config = QUESTION_TYPE_PROGRESSION[phase];
    const selectedTypes: ExerciseQuestionType[] = [];

    for (const typeConfig of config.allowedTypes) {
        for (let i = 0; i < typeConfig.min; i++) {
            selectedTypes.push(typeConfig.type);
        }
    }

    while (selectedTypes.length < config.questionCount) {
        const type = weightedRandom(config.allowedTypes);
        const currentCount = selectedTypes.filter(t => t === type).length;
        const typeConfig = config.allowedTypes.find(c => c.type === type);
        if (typeConfig && currentCount < typeConfig.max) {
            selectedTypes.push(type);
        }
    }

    return selectedTypes;
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

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: GenerateSessionRequest = await request.json();
        const { sessionType, testedPhrases, contextPhrases, clusterContext } = body;

        if (!testedPhrases || testedPhrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        // DEBUG: Log what phrases are being tested
        console.log(`[generate-session] Received ${testedPhrases.length} phrases to test:`, testedPhrases.map(p => p.phrase));

        // Extract unexposed potentialUsages (2 per phrase max) for natural inclusion
        const usagesIncluded: Array<{
            parentPhraseId: string;
            parentPhrase: string;
            usage: { phrase: string; meaning: string; type: string };
        }> = [];

        for (const phrase of testedPhrases) {
            const potentialUsages = phrase.potentialUsages || [];
            const unexposed = potentialUsages
                .filter(u => !u.exposed)
                .slice(0, 2);

            for (const usage of unexposed) {
                usagesIncluded.push({
                    parentPhraseId: phrase.id,
                    parentPhrase: phrase.phrase,
                    usage: {
                        phrase: usage.phrase,
                        meaning: usage.meaning,
                        type: usage.type || 'usage',
                    },
                });
            }
        }

        // Calculate average learning step
        const avgStep = testedPhrases.reduce((sum, p) => sum + (p.learningStep || 0), 0) / testedPhrases.length;

        // Select question types based on session and mastery
        const questionTypes = selectQuestionTypes(sessionType, avgStep);

        // Build prompt
        const testedList = testedPhrases.map((p, i) =>
            `${i + 1}. "${p.phrase}" - ${p.meaning}`
        ).join('\n');

        const contextList = contextPhrases.length > 0
            ? `\n\nCONTEXT PHRASES (use naturally but don't test these):\n${contextPhrases.map(p => `- "${p.phrase}"`).join('\n')}`
            : '';

        // Build related expressions section if usages exist
        const relatedSection = usagesIncluded.length > 0
            ? `\n\nADDITIONAL RELATED EXPRESSIONS (include naturally):\n${usagesIncluded.map(u =>
                `- "${u.usage.phrase}" (${u.usage.type} of "${u.parentPhrase}"): ${u.usage.meaning}`
            ).join('\n')}\nInclude 2-3 of these naturally.`
            : '';

        // Different prompts for quick_practice vs story sessions
        const isQuickPractice = sessionType === 'quick_practice';

        // Assign each question to a specific phrase (cycle through)
        const questionTypeInstructions = questionTypes
            .filter(t => t !== 'story_intro') // Skip story_intro in instructions
            .map((type, i) => {
                const phraseIndex = i % testedPhrases.length;
                const targetPhrase = testedPhrases[phraseIndex];
                const phraseLabel = `[Test phrase #${phraseIndex + 1}: "${targetPhrase.phrase}"]`;

                switch (type) {
                    // RECOGNITION PHASE
                    case 'social_consequence_prediction':
                        return `Q${i + 1} (social_consequence_prediction) ${phraseLabel}: Create a mini-story (2-3 sentences) where the phrase is used, then ask "What happens next?" with options showing social outcomes (connection, confusion, awkwardness, neutrality).`;
                    case 'situation_phrase_matching':
                        return `Q${i + 1} (situation_phrase_matching) ${phraseLabel}: Describe a vivid emotional situation (1-2 sentences) where this phrase is the natural response. Provide 3-4 options including: correct phrase, too formal/casual alternative, similar-sounding wrong meaning, and acceptable but less natural.`;
                    case 'tone_interpretation':
                        return `Q${i + 1} (tone_interpretation) ${phraseLabel}: Show a brief dialogue where someone uses this phrase. Ask "How does [speaker] feel?" with emotion options: correct emotion, opposite emotion, wrong intensity, related but incorrect.`;
                    case 'contrast_exposure':
                        return `Q${i + 1} (contrast_exposure) ${phraseLabel}: Compare this phrase with a similar-sounding phrase, showing different social outcomes in the same context. Include phrase1, phrase2, scenario1, scenario2, question, explanation.`;

                    // COMPREHENSION PHASE
                    case 'why_did_they_say':
                        return `Q${i + 1} (why_did_they_say) ${phraseLabel}: Create a dialogue (3-4 lines) using this phrase, then ask "Why did [speaker] use this phrase instead of something else?" with options: correct pragmatic reason, literal interpretation, wrong social goal, plausible but incorrect.`;
                    case 'appropriateness_judgment':
                        return `Q${i + 1} (appropriateness_judgment) ${phraseLabel}: Ask "In which situation is this phrase appropriate?" with 4 contexts: one correct, one too casual, one too formal, one where meaning doesn't fit.`;
                    case 'error_detection':
                        return `Q${i + 1} (error_detection) ${phraseLabel}: Write a sentence with a subtle usage error involving this phrase (wrong context, wrong form, wrong meaning). Provide wrongWord, sentence, 3-4 correction options, correctIndex, explanation.`;
                    case 'fill_gap_mcq':
                        return `Q${i + 1} (fill_gap_mcq) ${phraseLabel}: Create a natural dialogue (2-3 lines) with a blank for this phrase. Include dialogue array with isBlank:true, options (correct + wrong meaning + wrong register + awkward), correctIndex, explanation.`;
                    case 'register_sorting':
                        return `Q${i + 1} (register_sorting) ${phraseLabel}: Take this phrase and provide 2 register variants (casual/formal). Ask user to categorize phrases into Casual/Neutral/Formal. Include phrases array, categories, correctAssignment map.`;

                    // GUIDED PRODUCTION PHASE
                    case 'constrained_production':
                        return `Q${i + 1} (constrained_production) ${phraseLabel}: Create a situation requiring this phrase with specific constraints. Include targetPhrase, prompt (the task), context (the situation), hint. User must write a response using the phrase.`;
                    case 'transformation_exercise':
                        return `Q${i + 1} (transformation_exercise) ${phraseLabel}: Provide this phrase and ask user to rewrite in a different register (casual→formal or vice versa). Include originalPhrase, originalRegister, targetRegister, prompt, acceptableAnswers array.`;
                    case 'dialogue_completion_open':
                        return `Q${i + 1} (dialogue_completion_open) ${phraseLabel}: Create a dialogue context where user must complete with a response using this phrase. Include context, dialogueBefore, targetPhrase, hint. This is open-ended, not MCQ.`;

                    // MASTERY PHASE
                    case 'scenario_production':
                        return `Q${i + 1} (scenario_production) ${phraseLabel}: Create a complete social scenario where user must generate a full response naturally using this phrase. Include scenario description, targetPhrase, evaluationCriteria.`;
                    case 'multiple_response_generation':
                        return `Q${i + 1} (multiple_response_generation) ${phraseLabel}: Create a context where user must provide 2+ different valid responses using this phrase. Include context, targetPhrase, requiredCount: 2.`;
                    case 'explain_to_friend':
                        return `Q${i + 1} (explain_to_friend) ${phraseLabel}: Ask user to explain this phrase to a friend learning English. Include setup (friend's question), targetPhrase, requirements: [explain meaning, give example, mention when NOT to use].`;
                    case 'creative_context_use':
                        return `Q${i + 1} (creative_context_use) ${phraseLabel}: Ask user to create their own scenario where this phrase would be used naturally. Include targetPhrase, prompt, constraints.`;

                    // AUDIO/LISTENING SPECIFIC
                    case 'listen_select':
                        return `Q${i + 1} (listen_select) ${phraseLabel}: REQUIRED: audioText (sentence using phrase to be played), question, options (4 choices), correctIndex.`;
                    case 'type_what_you_hear':
                        return `Q${i + 1} (type_what_you_hear) ${phraseLabel}: REQUIRED: audioText (sentence to be spoken), acceptableAnswers (valid transcriptions).`;

                    // GMAT-STYLE: NEW QUESTION TYPES
                    case 'reading_comprehension':
                        return `Q${i + 1} (reading_comprehension) ${phraseLabel}: Write a short passage (3-5 sentences) that uses this phrase naturally in context. Then ask a comprehension question about what the phrase MEANS or IMPLIES in this specific passage. Include passage, targetPhrase, question, options (4: correct contextual meaning, dictionary-but-wrong-context, plausible-but-wrong-tone, literal), correctIndex, explanation.`;
                    case 'sentence_correction':
                        return `Q${i + 1} (sentence_correction) ${phraseLabel}: Write a sentence where this phrase is used ALMOST correctly but with a subtle error (wrong register for the context, wrong collocation, or slightly off meaning). Include sentence, underlinedPortion (the misused part), options (4: best correction, overcorrection, still-wrong, "No change needed"), correctIndex, explanation of error type.`;
                    case 'text_completion':
                        return `Q${i + 1} (text_completion) ${phraseLabel}: Write a paragraph (4-6 sentences) with 2 blanks ([BLANK_1], [BLANK_2]) where target phrases should go. Include paragraph, blanks array [{id, correctAnswer}], wordBank (5-6 options: 2 correct + 3-4 distractors that are real phrases), explanation.`;

                    default:
                        return '';
                }
            }).filter(Boolean).join('\n');

        // ─── SYSTEM PROMPT (persona + behavioral constraints) ─────────────
        const systemPrompt = `You are an expert vocabulary exercise designer for English language learners.

Your exercises are used by real language learners. The quality of your output directly impacts their learning.

IDENTITY:
- You think like a GMAT test designer crossed with a comedy writer
- You create scenarios that are vivid, specific, and emotionally engaging
- You design trap options that test NUANCE, not just vocabulary size

BEHAVIORAL RULES:
1. Every context must be specific enough to visualize as a movie scene
2. Never use generic contexts like "at work" or "with friends" — instead use "Your manager just cc'd the whole team on your mistake" or "Your roommate ate your labeled leftovers again"
3. Wrong options must be PLAUSIBLE — a learner should need to think, not just eliminate obvious nonsense
4. Explanations must teach the WHY — explain what distinguishes the correct answer from the best distractor
5. Each option should be roughly the same length (don't give away the answer by making it longer)
6. Never repeat the same scenario pattern across questions in one session

You respond ONLY in valid JSON. No markdown, no commentary, no code fences.

${QUESTION_QUALITY_PREAMBLE}`;

        let userPrompt: string;

        if (isQuickPractice) {
            userPrompt = `Generate ${questionTypes.length} vocabulary practice questions.

THEME: ${clusterContext.setting || clusterContext.theme}
TONE: ${clusterContext.pragmatics?.register || 'neutral'}

PHRASES TO TEST (each phrase MUST be tested at least once):
${testedList}${contextList}${relatedSection}

## STEP-BY-STEP PROCESS
For each question, think through these steps:
1. Pick a specific, vivid micro-context that creates an emotional reaction
2. Craft the correct answer so it fits the context perfectly
3. Design 3 trap options: (a) right connotation but wrong register, (b) similar meaning but wrong nuance, (c) commonly confused phrase
4. Write an explanation that teaches the DISTINCTION, not just the definition

## CONTEXT VARIETY (cycle through — never repeat)
- Professional: meetings, emails, presentations, performance reviews
- Social: parties, dinners, reunions, catching up
- Digital: texting, social media, group chats, dating apps
- Awkward: apologies, confrontations, misunderstandings
- Emotional: celebrations, bad news, gratitude, disappointment

${questionTypeInstructions}

## ❌ BAD QUESTION (avoid this pattern)
{
    "type": "fill_gap_mcq",
    "content": {
        "context": "At work.",
        "dialogue": [{"speaker": "Person", "text": "I need to _____.", "isBlank": true}],
        "options": ["break the ice", "eat food", "sleep well", "run fast"],
        "correctIndex": 0,
        "explanation": "Break the ice means to start a conversation."
    }
}
Why it's bad: Generic context ("at work"), absurd distractors (no learner would pick "eat food"), explanation just defines the phrase.

## ✅ GOOD QUESTION (aim for this)
{
    "type": "fill_gap_mcq",
    "content": {
        "context": "You just joined a new team and it's your first lunch with them. Everyone is eating in awkward silence.",
        "dialogue": [{"speaker": "You", "text": "Someone needs to _____ — this silence is killing me.", "isBlank": true}],
        "options": ["break the ice", "clear the air", "call it a day", "beat around the bush"],
        "correctIndex": 0,
        "explanation": "'Break the ice' means starting conversation in an awkward silence. 'Clear the air' is for resolving tension after a conflict — there's no conflict here, just shyness."
    }
}
Why it's good: Vivid context you can picture, all 4 options are real idioms a learner might confuse, explanation teaches the distinction between the two closest options.

## OUTPUT CONSTRAINTS
- "context": 1-3 sentences, must include a specific situation
- "options": 4 choices, each 2-8 words, roughly equal length
- "targetPhraseIds": must reference actual phrase IDs from the input
- "xpReward": always 10

OUTPUT FORMAT:
{
    "questions": [
        {
            "type": "question_type_here",
            "content": { ... },
            "targetPhraseIds": ["phrase_id"],
            "xpReward": 10,
            "explanation": "1-2 sentences explaining why the best distractor is wrong.",
            "trivia": "A short, fun 'Did you know?' fact about the target phrase's origin or usage."
        }
    ]
}

## FINAL QUALITY GATE (check every question before returning)
✓ Could I visualize this context as a movie scene?
✓ Would a learner need to THINK to pick the right answer?
✓ Does the explanation teach something they didn't know before?
✓ Are all options roughly the same length?
✓ Is each phrase tested at least once?`;
        } else {
            // STORY-BASED: For story/listening sessions
            userPrompt = `Generate a story-based exercise session.

SETTING: ${clusterContext.setting || clusterContext.theme}
TONE: ${clusterContext.pragmatics?.register || 'neutral'}
RELATIONSHIP: ${clusterContext.pragmatics?.relationship || 'peer'}

PHRASES TO TEST (${testedPhrases.length} — ALL must appear in the story AND be tested):
${testedList}${contextList}${relatedSection}

## STEP-BY-STEP PROCESS
1. First, design 2-3 characters with distinct voices (casual vs formal, confident vs nervous)
2. Write a 200-400 word story/conversation where ALL phrases appear naturally — NOT forced in
3. Then create questions that test comprehension of each phrase IN the story context

## STORY QUALITY RULES
- Characters must sound like real people, not textbooks
- Use contractions, fillers ("um", "like", "you know"), interruptions
- Each phrase should feel inevitable in context, not inserted for learning
- The story should have a mini arc: setup → tension → resolution

## ❌ UNNATURAL STORY (avoid)
A: "Hello. I would like to break the ice."
B: "Yes, breaking the ice is important."

## ✅ NATURAL STORY (aim for)
A: "So... this is awkward, huh? First day and I don't know anyone."
B: "Ha, tell me about it. I've been sitting here for ten minutes trying to break the ice with the person next to me."
A: "And? How'd that go?"
B: "They had earbuds in. So... not great."

${questionTypeInstructions}

## OUTPUT CONSTRAINTS
- "narrative": 200-400 words, natural dialogue with contractions
- All tested phrases must appear in both the story AND the questions

OUTPUT FORMAT:
{
    "storyContext": {
        "title": "Catchy title (≤6 words)",
        "setting": "One-sentence setting",
        "characters": ["Name1", "Name2"],
        "narrative": "Full story text...",
        "segments": [
            { "type": "narration", "text": "..." },
            { "type": "dialogue", "speaker": "Marcus", "speakerRole": "Friend", "text": "..." }
        ]
    },
    "questions": [
        {
            "type": "question_type",
            "content": { ... },
            "targetPhraseIds": ["phrase_id"],
            "xpReward": 10,
            "explanation": "1-2 sentences explaining the answer IN the story context.",
            "trivia": "A short, fun 'Did you know?' fact about the target phrase."
        }
    ]
}

## FINAL QUALITY GATE
✓ Does the story sound like real people talking?
✓ Does each phrase feel natural in context (not inserted for learning)?
✓ Do questions test comprehension of phrase meaning IN this story?
✓ Are explanations story-specific, not generic definitions?`;
        }

        // ─── API CALL (system + user, per-type temperature) ────────────────
        const temperature = isQuickPractice ? 0.7 : 0.6;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 4000,
                temperature,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('DeepSeek API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-session',
                model: 'grok-3-mini-fast',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean and parse
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            const parsed = JSON.parse(text);

            if (!parsed.questions) {
                throw new Error('Invalid response structure - missing questions');
            }

            // Story sessions require storyContext
            if (!isQuickPractice && !parsed.storyContext) {
                throw new Error('Invalid response structure - missing storyContext for story session');
            }

            // Build story_intro as the first question (only for story sessions)
            let storyIntroQuestion: ExerciseQuestion | null = null;
            if (!isQuickPractice && parsed.storyContext) {
                storyIntroQuestion = {
                    id: `q_${Date.now()}_intro`,
                    type: 'story_intro',
                    content: {
                        type: 'story_intro',
                        title: parsed.storyContext.title,
                        setting: parsed.storyContext.setting,
                        characters: parsed.storyContext.characters || [],
                        narrative: parsed.storyContext.narrative,
                        segments: parsed.storyContext.segments || [],
                    } as any,
                    targetPhraseIds: [],
                    contextPhraseIds: [],
                    xpReward: 0,
                };
            }

            // Map question content fields to match component expectations
            const mappedQuestions = parsed.questions.map((q: any, i: number) => {
                const content = { type: q.type, ...q.content };

                // Ensure complete_the_story has storyExcerpt and options
                if (q.type === 'complete_the_story') {
                    if (!content.storyExcerpt) {
                        content.storyExcerpt = content.excerpt || content.text || content.sentence || content.storySnippet || '_____';
                    }
                    if (!content.options || !Array.isArray(content.options)) {
                        content.options = content.choices || content.answers || ['Option A', 'Option B', 'Option C'];
                    }
                    if (content.correctIndex === undefined) {
                        content.correctIndex = content.correctAnswer || content.answer || 0;
                    }
                }

                // Ensure listen_select/type_what_you_hear has audioText
                if ((q.type === 'listen_select' || q.type === 'type_what_you_hear') && !content.audioText) {
                    content.audioText = content.text || content.sentence || content.phrase ||
                        (content.options?.[content.correctIndex]) || 'The phrase you need to identify.';
                }

                // Ensure spot_mistake has all required fields
                if (q.type === 'spot_mistake' || q.type === 'error_detection') {
                    if (!content.sentence) {
                        content.sentence = content.text || content.mistakeSentence || '';
                    }
                    if (!content.wrongWord) {
                        content.wrongWord = content.mistake || content.incorrectWord || content.error || 'mistake';
                    }
                    if (!content.options || !Array.isArray(content.options)) {
                        content.options = content.choices || content.answers || content.corrections || [];
                    }
                    if (content.correctIndex === undefined) {
                        content.correctIndex = content.correctAnswer ?? content.answer ?? 0;
                    }
                }

                // Ensure what_would_you_say has context and prompt
                if (q.type === 'what_would_you_say') {
                    if (!content.context) {
                        content.context = content.situation || content.scenario || content.description || 'You are in a conversation.';
                    }
                    if (!content.prompt) {
                        content.prompt = content.question || content.task || 'What would you say?';
                    }
                }

                // Ensure tone_interpretation has phrase
                if (q.type === 'tone_interpretation') {
                    if (!content.phrase) {
                        content.phrase = content.dialogue || content.text || content.sentence || '...';
                    }
                    if (!content.options || !Array.isArray(content.options)) {
                        content.options = content.choices || content.answers || ['Correct emotion', 'Incorrect emotion', 'Wrong intensity', 'Related but incorrect'];
                    }
                }

                // Ensure contrast_exposure has phraseA and phraseB
                if (q.type === 'contrast_exposure') {
                    if (!content.phraseA) {
                        content.phraseA = content.phrase1 || content.phrase || 'Phrase A';
                    }
                    if (!content.phraseB) {
                        content.phraseB = content.phrase2 || content.comparison || 'Phrase B';
                    }
                    if (!content.options || !Array.isArray(content.options)) {
                        content.options = content.choices || content.answers || [
                            'Option A describes the difference accurately',
                            'Option B misinterprets one phrase',
                            'Option C misinterprets both phrases',
                            'Option D says there is no difference'
                        ];
                    }
                }

                // Ensure register_sorting has correctOrder mapped from categories/correctAssignment
                if (q.type === 'register_sorting') {
                    if (!content.correctOrder && content.categories && content.correctAssignment && content.phrases) {
                        try {
                            const categoryMap = new Map(content.categories.map((cat: string, i: number) => [cat, i]));
                            const phraseIndices = content.phrases.map((_: any, i: number) => i);
                            phraseIndices.sort((a: number, b: number) => {
                                const catA = (categoryMap.get(content.correctAssignment[content.phrases[a]]) ?? 0) as number;
                                const catB = (categoryMap.get(content.correctAssignment[content.phrases[b]]) ?? 0) as number;
                                return catA - catB;
                            });
                            content.correctOrder = phraseIndices;
                        } catch (e) {
                            console.error('Failed to map register_sorting correctOrder:', e);
                            content.correctOrder = content.phrases.map((_: any, i: number) => i); // Fallback to index order
                        }
                    }
                }

                // Ensure multiple_response_generation has mapped keys
                if (q.type === 'multiple_response_generation') {
                    if (!content.scenario) {
                        content.scenario = content.context || 'You are in a situation.';
                    }
                    if (!content.targetPhrases || !Array.isArray(content.targetPhrases)) {
                        content.targetPhrases = content.targetPhrase ? [content.targetPhrase] : [];
                    }
                    if (!content.minResponses) {
                        content.minResponses = content.requiredCount || 2;
                    }
                }

                // Ensure explain_to_friend has its required definition fields
                if (q.type === 'explain_to_friend') {
                    content.phrase = content.targetPhrase || content.phrase || 'The phrase';
                    const matchingPhrase = testedPhrases.find((p: any) =>
                        p.phrase.toLowerCase().includes(content.phrase.toLowerCase()) ||
                        content.phrase.toLowerCase().includes(p.phrase.toLowerCase())
                    );

                    if (!content.meaning) {
                        content.meaning = matchingPhrase?.meaning || 'Explain what this phrase means and how to use it.';
                    }
                    if (!content.register) {
                        content.register = matchingPhrase?.register || 'neutral';
                    }
                    if (!content.goodExampleContext) {
                        content.goodExampleContext = content.setup || 'Your friend asks what this means.';
                    }
                }

                // Ensure transformation_exercise maps correctly to RegisterSwapQuestion
                if (q.type === 'transformation_exercise') {
                    if (!content.originalText) {
                        content.originalText = content.originalPhrase || content.text || content.sentence || 'Original phrase';
                    }
                    if (!content.currentRegister) {
                        content.currentRegister = content.originalRegister || content.fromRegister || 'informal';
                    }
                    if (!content.targetRegister) {
                        content.targetRegister = content.toRegister || 'formal';
                    }

                    if (!content.options || !Array.isArray(content.options)) {
                        // Fallback if AI generated acceptableAnswers instead of options
                        if (content.acceptableAnswers && Array.isArray(content.acceptableAnswers) && content.acceptableAnswers.length > 0) {
                            content.options = [content.acceptableAnswers[0], content.originalText];
                            content.correctIndex = 0;
                        } else {
                            content.options = ['Correct transformation', 'Incorrect transformation'];
                            content.correctIndex = 0;
                        }
                    } else if (content.correctIndex === undefined) {
                        content.correctIndex = 0;
                    }
                }

                return {
                    id: `q_${Date.now()}_${i}`,
                    type: q.type,
                    content,
                    targetPhraseIds: q.targetPhraseIds || [],
                    contextPhraseIds: [],
                    xpReward: q.xpReward || 10,
                    explanation: q.explanation || content.explanation || undefined,
                    trivia: q.trivia || content.trivia || undefined,
                };
            });

            // Shuffle the questions (Fisher-Yates) to make the session less predictable
            for (let i = mappedQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [mappedQuestions[i], mappedQuestions[j]] = [mappedQuestions[j], mappedQuestions[i]];
            }

            // Build session based on type
            let session: Partial<ExerciseSession>;

            if (isQuickPractice) {
                // DUOLINGO-STYLE: No story, just questions
                session = {
                    type: sessionType,
                    storyContext: undefined,
                    questions: mappedQuestions,
                    testedPhraseIds: testedPhrases.map(p => p.id),
                    contextPhraseIds: contextPhrases.map(p => p.id),
                };
            } else {
                // STORY-BASED: Include story_intro as first question
                session = {
                    type: sessionType,
                    storyContext: {
                        ...parsed.storyContext,
                        paragraphs: parsed.storyContext.narrative.split('\n\n').filter(Boolean),
                    },
                    questions: [storyIntroQuestion!, ...mappedQuestions],
                    testedPhraseIds: testedPhrases.map(p => p.id),
                    contextPhraseIds: contextPhrases.map(p => p.id),
                };
            }

            return NextResponse.json({
                session,
                questionCount: session.questions?.length || 0,
                success: true,
                // Child expressions for promotion on completion
                usagesIncluded,
            });

        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return NextResponse.json({
                error: 'Failed to parse response',
                raw: text.substring(0, 500),
            }, { status: 500 });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Generate session error:', errorMessage);
        return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
    }
}
