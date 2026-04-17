import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { safeParseAIJson } from '../src/lib/ai-utils';
import { getGrokKey } from '../src/lib/grok-client';
import { computeSessionSize } from '../src/lib/exercise/config';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

async function mockGenerateSession() {
    if (!XAI_API_KEY) {
        console.error('No XAI configuration found. Skipping AI generation.');
        return;
    }

    // Mock phrases
    const mockDuePhrases = [
        { phrase: 'ubiquitous', learningStep: 1, meaning: 'present everywhere' },
        { phrase: 'deleterious', learningStep: 2, meaning: 'causing harm or damage' },
        { phrase: 'ephemeral', learningStep: 4, meaning: 'lasting for a very short time' },
        { phrase: 'idiosyncrasy', learningStep: 0, meaning: 'a mode of behavior peculiar to an individual' },
    ];

    const weakTypes = ['fallacy_id', 'fix_argument'];
    const sourcePlatform = 'reddit';

    const phraseInventory = mockDuePhrases.map(p => {
        const maturity = (p.learningStep || 0) >= 2 ? '[MATURE]' : '[NEW]';
        return `- "${p.phrase}" ${maturity} (${p.meaning || 'contextual'})`;
    }).join('\n');

    const weaknessHint = weakTypes.length > 0
        ? `\nThe user is weakest at these question types: ${weakTypes.join(', ')}. Lean toward generating more of these.`
        : '';

    const prompt = `You are generating a THINKING-FIRST vocabulary exercise session. Every question tests a thinking skill (logic, cohesion, register awareness) — vocabulary words are embedded naturally in the content, NEVER headlined.

## STEP 1: ANCHOR PASSAGE

Write a 300-500 word argumentative passage that:
1. Takes a clear, debatable position on a real-world topic
2. Naturally embeds ALL of the following vocabulary phrases (don't force them — weave them into the argument)
3. Contains exactly THREE DELIBERATE FLAWS for students to detect:
   - **Logical gap**: One claim that doesn't follow from its premises (a non-sequitur, false cause, or missing evidence)
   - **Weak transition**: One sentence-to-sentence connection that feels jumpy or disconnected
   - **Register break**: One sentence whose tone/formality clashes with the rest (too casual in a formal passage, or vice versa)
4. Feels like authentic content from a $sourcePlatform} — match the formatting conventions and typical topics of that platform
5. TONE RULE: Make the tone casual, conversational, internet-slangy, dramatic, or highly opinionated unless the platform STRICTLY demands formality (like a cover_letter) AND you are testing register. ABSOLUTELY DO NOT make the overall tone corporate, formal, or professional.
6. Is intellectually engaging and feels like something a real person wrote this week

VOCABULARY TO EMBED:
${phraseInventory}

## STEP 2: QUESTIONS (6 total, across 3 Skill Modules)

Generate exactly 6 questions organized into exactly 3 Modules.

### Module 1: The Structure Game (Cohesion Axis) - 2 questions
Test how the passage flows and connects. Focus on finding out-of-place sentences or reordering flow.
Valid interaction types: reorder, highlight, mcq (e.g., spot_intruder, restructure)

### Module 2: The Expression Game (Naturalness Axis) - 2 questions
Test tone, word choice, and registry. Focus on authentic phrasing and detecting formality mismatch.
Valid interaction types: ab_pick, reorder, mcq (e.g., ab_natural, register_sort, tone_interpretation, register_shift)

### Module 3: The Logic Game (Task Achievement Axis) - 2 questions
Test the underlying argument and reasoning. Focus on fixing logical gaps or identifying fallacies.
Valid interaction types: mcq, rating, freewrite (e.g., fallacy_id, inference_bridge, rate_argument, fix_argument, synthesis_response)

${weaknessHint}

**Constraint Checklist & Confidence Score:**
1. SRS COGNITIVE LOAD RULE: You MUST NOT generate Active (freewrite / open-production) questions for any phrase tagged as \`[NEW]\`. New phrases may only be tested via Passive recognition (MCQ, highlight, reorder). \`[MATURE]\` phrases can be tested using Active/freewrite interactions.
2. SEQUENCING RULE: If you generate a freewrite/synthesis interaction, it MUST be the very last question of Module 3 to preserve the cognitive ramp-up.

## QUESTION TYPE FORMATS:

**Passive (MCQ-based):**
- \`tone_interpretation\`: "What is the author signaling by writing ___?" → 4 options
- \`ab_natural\`: Show two versions of a sentence. "Which sounds more natural?" → 2 options (A/B)
- \`inference_bridge\`: "Based on the claim in paragraph 2, which conclusion follows?" → 4 options
- \`spot_intruder\`: "Which sentence breaks the paragraph's unity?" → List 4-5 sentences, one doesn't belong
- \`fallacy_id\`: "The argument in [excerpt] is flawed because..." → 4 options naming logical flaws
- \`rate_argument\`: "How strong is this argument?" → 3 options: "Solid" / "Has holes" / "Falls apart"
- \`register_sort\`: Show 3-4 sentences. "Rank these from most formal to most casual" → ordered items
- \`restructure\`: Show 4-5 scrambled sentences. "Put these in logical order" → ordered items

**Active (free response):**
- \`fix_argument\`: "Rewrite this paragraph to fix the logical flaw" → user writes paragraph
- \`register_shift\`: "Rewrite this sentence for [different audience]" → user writes
- \`synthesis_response\`: "In 3-5 sentences, take your own position on [topic]. Use at least 2 of these phrases naturally: [phrases]" → user writes

## JSON OUTPUT FORMAT:

{
  "anchorPassage": {
    "text": "The full 300-500 word passage text",
    ...
  },
  "questions": [
    {
      "id": "q_1",
      "type": "tone_interpretation",
      "skillAxis": "naturalness",
      "prompt": "What is the author signaling when they write '...'?",
      // ...
    }
  ]
}
`;

    console.log('Sending Prompt to AI...');
    console.log(phraseInventory);

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
                        content: 'You are an expert in critical thinking pedagogy and argumentative writing... You respond ONLY in valid JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 5000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI API error:', response.status, await response.text());
            return;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        const parseResult = safeParseAIJson<any>(content);
        if (!parseResult.success) {
            console.error('Failed to parse JSON', parseResult.error);
            return;
        }

        const session = parseResult.data;
        console.log('\n--- AI RESPONSE ---');
        console.log(`Topic: ${session.anchorPassage?.topic}`);
        console.log(`Total Questions: ${session.questions?.length}`);

        const modules: any = { cohesion: 0, naturalness: 0, task_achievement: 0 };
        let hasFreewriteForNew = false;
        let lastQuestionFreewrite = false;

        session.questions?.forEach((q: any, i: number) => {
            modules[q.skillAxis] = (modules[q.skillAxis] || 0) + 1;
            console.log(`[Q${i + 1}] Axis: ${q.skillAxis} | Type: ${q.type}`);

            // Adherence check
            if (['fix_argument', 'register_shift', 'synthesis_response'].includes(q.type)) {
                if (i !== session.questions.length - 1) {
                    console.log(`❌ ERROR: Freewrite question at index ${i} is not the absolute last!`);
                } else {
                    lastQuestionFreewrite = true;
                }
            }
        });

        console.log('\n--- ADHERENCE CHECKS ---');
        console.log(`Modules Breakdown: Cohesion(${modules.cohesion}), Naturalness(${modules.naturalness}), Logic/Task(${modules.task_achievement})`);
        
        const adherenceScore = Object.values(modules).reduce((a: any, b: any) => a + b, 0) === 6 ? '✅ Length Correct' : '❌ Length Incorrect';
        console.log(adherenceScore);
        
    } catch (e) {
        console.error('Execution Error', e);
    }
}

mockGenerateSession();
