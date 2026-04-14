/**
 * Batch prompt builders for Grok API
 *
 * Generates prompts for:
 * - Article processing (phrase extraction, vocab, sections, lexile)
 * - Practice article generation (Substack-style articles with inline questions)
 * - Feed quiz generation (21 question types for swipeable cards)
 */

import type { BatchRequest } from './grok-batch';
import { computeSessionSize } from './exercise/config';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PhraseForBatch {
  id: string;
  phrase: string;
  meaning?: string;
  register?: string;
  nuance?: string;
  context?: string;
  topics?: string[];
  learningStep?: number;
}

export interface WeaknessForBatch {
  id: string;
  category: string;
  specific: string;
  examples: string[];
  correction: string;
  explanation: string;
}

// Phase determination (matches question-prompts.ts getPhase)
export function getPhaseForStep(step: number): 'recognition' | 'comprehension' | 'guided_production' | 'mastery' {
  if (step <= 2) return 'recognition';
  if (step <= 4) return 'comprehension';
  if (step <= 6) return 'guided_production';
  return 'mastery';
}

// Question types per phase
export const PHASE_QUESTION_TYPES: Record<string, string[]> = {
  recognition: [
    'social_consequence_prediction',
    'situation_phrase_matching',
    'tone_interpretation',
    'contrast_exposure',
  ],
  comprehension: [
    'fill_gap_mcq',
    'why_did_they_say',
    'error_detection',
    'appropriateness_judgment',
    'register_sorting',
    'reading_comprehension',
    'sentence_correction',
  ],
  guided_production: [
    'constrained_production',
    'transformation_exercise',
    'dialogue_completion_open',
    'text_completion',
  ],
  mastery: [
    'scenario_production',
    'explain_to_friend',
    'multiple_response_generation',
    'creative_context_use',
  ],
};

// 18 non-listening feed types + 3 dedicated listening types
export const FEED_FRIENDLY_TYPES: string[] = [
  ...PHASE_QUESTION_TYPES.recognition,
  ...PHASE_QUESTION_TYPES.comprehension,
  ...PHASE_QUESTION_TYPES.guided_production,
  'listen_and_identify',
  'tone_by_voice',
  'dictation'
];

// 8 non-listening types that also work well as listening-mode cards
// (scenario can be meaningfully understood through audio alone)
export const LISTENING_COMPATIBLE_TYPES: string[] = [
  'social_consequence_prediction',
  'situation_phrase_matching',
  'tone_interpretation',
  'fill_gap_mcq',
  'why_did_they_say',
  'appropriateness_judgment',
  'reading_comprehension',
  'sentence_correction',
];

// Feed-friendly types per phase (for phase-aware selection)
export const FEED_PHASE_TYPES: Record<string, string[]> = {
  recognition: PHASE_QUESTION_TYPES.recognition,
  comprehension: PHASE_QUESTION_TYPES.comprehension,
  guided_production: PHASE_QUESTION_TYPES.guided_production,
  // mastery phrases fall back to comprehension on feed (full production in /practice)
  mastery: PHASE_QUESTION_TYPES.comprehension,
};

// ═══════════════════════════════════════════════════════════════════════════
// TOPIC CLUSTERING UTILITY
// ═══════════════════════════════════════════════════════════════════════════

export interface SimpleCluster {
  topic: string;
  register: string;
  phrases: PhraseForBatch[];
}

/**
 * Group phrases by topic + register for article generation.
 * Phrases that don't form a group of ≥2 get lumped into a "mixed" cluster.
 */
export function clusterPhrasesByTopic(phrases: PhraseForBatch[]): SimpleCluster[] {
  const groups = new Map<string, PhraseForBatch[]>();

  for (const phrase of phrases) {
    const topic = phrase.topics?.[0] || 'general';
    const register = phrase.register || 'consultative';
    const key = `${topic}__${register}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(phrase);
  }

  const clusters: SimpleCluster[] = [];
  const mixed: PhraseForBatch[] = [];

  for (const [key, groupPhrases] of groups) {
    const [topic, register] = key.split('__');
    if (groupPhrases.length >= 2) {
      clusters.push({ topic, register, phrases: groupPhrases });
    } else {
      mixed.push(...groupPhrases);
    }
  }

  if (mixed.length > 0) {
    clusters.push({ topic: 'mixed', register: 'consultative', phrases: mixed });
  }

  return clusters;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE PROCESSING PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export function buildArticleBatchRequest(
  postId: string,
  title: string,
  content: string
): BatchRequest {
  const prompt = `You are an expert English language teacher and reading experience designer. Analyze this article comprehensively.

ARTICLE TITLE: "${title}"
ARTICLE CONTENT:
"""
${content.substring(0, 50000)}
"""

Perform ALL of the following tasks in ONE response:

━━━ TASK 1: PHRASE EXTRACTION ━━━
Extract 15-25 phrases that are useful for English learners:
- Collocations (e.g., "drive growth", "make a decision")
- Discourse markers (e.g., "on the other hand", "in light of")
- Academic expressions, idioms, phrasal verbs
- Topic-specific vocabulary phrases (2+ words)
Return as a flat string array called "highlightedPhrases".

━━━ TASK 2: TOPIC VOCABULARY + LEXILE ━━━
Extract 10-20 vocabulary items (single words AND phrases):
- Domain-specific terms (B2-C2 level)
- Include partOfSpeech: "noun"|"verb"|"adjective"|"adverb"|"phrase"
- Include frequency: "common"|"intermediate"|"advanced"
- Include example sentence

Also assess reading difficulty:
- level: "easy"|"medium"|"hard"
- score: 400-1600 Lexile score
- reasoning: brief explanation

━━━ TASK 3: READING SECTIONS ━━━
Divide the article into 3-8 logical sections for a card-based swipe reading interface:
- Each section ~100-250 words
- Split at natural breakpoints (not mid-sentence)
- Include the original HTML formatting
- Extract 2-5 notable vocab phrases per section
- Generate a one-line subtitle/caption for the article

━━━ TASK 4: TOPIC DETECTION ━━━
Identify the article's main topic (1-2 words, e.g., "Technology", "Climate Science").

Return ONLY this JSON structure:
{
  "detectedTopic": "Topic Name",
  "highlightedPhrases": ["phrase1", "phrase2"],
  "topicVocab": [{ "word": "", "meaning": "", "partOfSpeech": "", "topic": "", "frequency": "", "example": "" }],
  "lexile": { "level": "", "score": 0, "reasoning": "" },
  "subtitle": "",
  "sections": [{ "title": "", "content": "", "vocabPhrases": [] }]
}`;

  return {
    batch_request_id: `article_${postId}`,
    messages: [
      { role: 'system', content: 'You are an expert English language teacher. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 16384,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE ARTICLE GENERATION PROMPT (Substack-style)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a batch request to generate a Practice Article (Elevate-style 3-module session)
 * that weaves in all of a user's due vocabulary phrases.
 * Used by cron 1 (daily-import) for listening-day sessions.
 * Results are collected by cron 2 and saved to generatedSessions.
 */
export function buildPracticeArticleBatchRequest(
  userId: string,
  phrases: PhraseForBatch[],
  clusters: SimpleCluster[],
  weakTypes: string[] = [],
  sourcePlatform: string = 'linkedin',
): BatchRequest {
  // Group phrases by SRS phase (matches config.ts phaseFromStep)
  const phased = { recognition: [] as PhraseForBatch[], active_recall: [] as PhraseForBatch[], production: [] as PhraseForBatch[] };
  for (const p of phrases) {
    const step = p.learningStep || 0;
    if (step <= 1) phased.recognition.push(p);
    else if (step <= 3) phased.active_recall.push(p);
    else phased.production.push(p);
  }

  const phraseInventory = phrases.map(p => {
    const phase = (p.learningStep || 0) <= 1 ? '[RECOGNITION]' : (p.learningStep || 0) <= 3 ? '[ACTIVE_RECALL]' : '[PRODUCTION]';
    return `- "${p.phrase}" ${phase} step=${p.learningStep || 0} (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`;
  }).join('\n');

  // Build phase sections
  const phaseSections: string[] = [];
  const sessionSize = computeSessionSize(phrases.length);
  const [minWords, maxWords] = sessionSize.passageWordRange;
  const activePhases: ('recognition' | 'active_recall' | 'production')[] = [];
  if (phased.recognition.length > 0) activePhases.push('recognition');
  if (phased.active_recall.length > 0) activePhases.push('active_recall');
  if (phased.production.length > 0) activePhases.push('production');

  const totalPhrases = phrases.length;
  const budget: Record<string, number> = { recognition: 0, active_recall: 0, production: 0 };
  for (const phase of activePhases) {
    budget[phase] = Math.max(1, Math.round((phased[phase].length / totalPhrases) * sessionSize.totalQuestions));
  }
  let budgetSum = Object.values(budget).reduce((a, b) => a + b, 0);
  while (budgetSum > sessionSize.totalQuestions) {
    const maxPhase = activePhases.reduce((a, b) => budget[a] >= budget[b] ? a : b);
    budget[maxPhase]--;
    budgetSum--;
  }
  while (budgetSum < sessionSize.totalQuestions) {
    const maxPhase = activePhases.reduce((a, b) => phased[a].length >= phased[b].length ? a : b);
    budget[maxPhase]++;
    budgetSum++;
  }

  if (phased.recognition.length > 0) {
    const phraseList = phased.recognition.map(p => `- "${p.phrase}" (${p.meaning || 'contextual'})`).join('\n');
    phaseSections.push(`### RECOGNITION QUESTIONS (${budget.recognition})
Interaction types: spot_intruder, fallacy_id, inference_bridge, tone_interpretation, rate_argument, swipe_judge, category_sort, best_response
Primary phrases (SRS steps 0-1):
${phraseList}

Generate ${budget.recognition} questions. Each question's passageReference should be a generous excerpt containing phrases from ALL phases.`);
  }

  if (phased.active_recall.length > 0) {
    const phraseList = phased.active_recall.map(p => `- "${p.phrase}" (${p.meaning || 'contextual'})`).join('\n');
    phaseSections.push(`### ACTIVE RECALL QUESTIONS (${budget.active_recall})
Interaction types: restructure, register_sort, match_pairs, tap_passage, fill_blank, ab_natural, build_sentence, spot_and_fix, cloze_passage
Primary phrases (SRS steps 2-3):
${phraseList}

Generate ${budget.active_recall} questions. Passage excerpts should be rich with vocabulary from ALL phases.`);
  }

  if (phased.production.length > 0) {
    const phraseList = phased.production.map(p => `- "${p.phrase}" [ID: ${p.id}] (${p.meaning || 'contextual'})`).join('\n');
    phaseSections.push(`### PRODUCTION QUESTIONS (${budget.production})
Interaction types: fix_argument, register_shift, synthesis_response
Primary phrases (SRS steps 4-5):
${phraseList}

PRODUCTION PHRASE TRACKING: For each freewrite question, include:
- "expectedPhrases": 1-3 phrase strings the user should use
- "expectedPhraseIds": corresponding ID strings
Place production questions LAST.`);
  }

  const weaknessHint = weakTypes.length > 0
    ? `\nWEAKNESS TARGETING: The user struggles with: ${weakTypes.join(', ')}. Lean toward these within each phase.`
    : '';

  const prompt = `You are generating a vocabulary exercise session with CROSS-PHRASE EXPOSURE organized into EXCERPT BLOCKS.

## STEP 1: ANCHOR PASSAGE

Write a ${minWords}-${maxWords} word argumentative passage that:
1. Takes a clear, debatable position on a real-world topic
2. Naturally embeds ALL vocabulary phrases
3. Contains THREE DELIBERATE FLAWS (logical gap, weak transition, register break)
4. Feels like authentic ${sourcePlatform} content
5. TONE: Casual, conversational, opinionated (not corporate/formal)

VOCABULARY TO EMBED:
${phraseInventory}

## STEP 2: EXCERPT BLOCKS (${sessionSize.excerptCount} excerpts, ${sessionSize.totalQuestions} questions total)

Carve the passage into ${sessionSize.excerptCount} overlapping excerpts (150-250 words each). Each excerpt should contain 2-4 phrases from MULTIPLE phases.

For each excerpt, generate ~${sessionSize.questionsPerExcerpt} questions. Production/freewrite questions go in the LAST excerpt block.

${phaseSections.join('\n\n')}
${weaknessHint}

## QUESTION TYPE FORMATS:

**Recognition:** tone_interpretation (4 MCQ), inference_bridge (4 MCQ), spot_intruder (4-5 options + correctIndex), fallacy_id (4 MCQ), rate_argument (3 MCQ), swipe_judge (swipeCards [{text, isNatural}]), category_sort (categories + categoryItems [{text, correctCategory}]), best_response (dialogueTurns [{speaker, text}] + responseOptions + correctResponseIndex)
**Active Recall:** ab_natural (2 options A/B), register_sort (items + correctOrder), restructure (items + correctOrder), match_pairs (pairs [{left, right}]), fill_blank (blankSentence + wordBank + correctWord), tap_passage (tappableSegments + correctSegmentIndex), build_sentence (sentenceChips [shuffled] + correctSentence), spot_and_fix (errorSegments + errorIndex + correctFix), cloze_passage (clozeText with __(N)__ + blanks [{index, correctWord}] + wordBank)
**Production:** fix_argument, register_shift, synthesis_response (evaluationCriteria + expectedPhrases + expectedPhraseIds)

## JSON OUTPUT:
{
  "anchorPassage": {
    "text": "passage text",
    "topic": "topic label",
    "centralClaim": "main position",
    "deliberateFlaws": { "logicalGap": "", "weakTransition": "", "registerBreak": "" },
    "embeddedVocab": ["phrase1"]
  },
  "excerptBlocks": [
    {
      "excerptId": "ex_1",
      "excerptText": "A 150-250 word excerpt...",
      "questions": [
        {
          "id": "q_1", "type": "tone_interpretation", "skillAxis": "naturalness",
          "learningPhase": "recognition",
          "prompt": "...",
          "options": ["A","B","C","D"], "correctIndex": 2,
          "explanation": "..."
        }
      ]
    }
  ]
}

Production/freewrite questions go in the LAST excerpt block.`;

  return {
    batch_request_id: `practice_article_${userId}`,
    messages: [
      {
        role: 'system',
        content: 'You are an expert in critical thinking pedagogy and argumentative writing. You create exercises that test reasoning skills through authentic content. Respond ONLY with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 8000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED QUIZZES GENERATION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export interface FeedQuizSpec {
  phraseId: string;
  phrase: string;
  meaning: string;
  register: string;
  questionType: string;
  source: 'phrase' | 'drill';
  isListening?: boolean;
  weaknessCategory?: string;
  example?: string;
  correction?: string;
}

/**
 * Builds a batch request to generate feed quizzes using V2 interaction types.
 * Each item specifies its questionType so the AI generates the right kind of content.
 * This runs daily to pre-generate swipeable quizzes based on due phrases & weaknesses.
 */
export function buildFeedQuizBatchRequest(
  userId: string,
  specs: FeedQuizSpec[],
  sourcePlatform: string = 'linkedin',
  sourceLabel: string = '💼 LinkedIn post'
): BatchRequest {
  const cardTypes = specs.map(s => s.questionType);

  const phraseSpecs = specs.filter(s => s.source === 'phrase');
  const drillSpecs = specs.filter(s => s.source === 'drill');

  const phraseLines = phraseSpecs.map((s, i) => 
      `${i + 1}. PHRASE: "${s.phrase}" | meaning: ${s.meaning} | register: ${s.register} | cardType: ${s.questionType}`
  );
  
  const drillLines = drillSpecs.map((s, i) => 
      `${phraseSpecs.length + i + 1}. DRILL: weakness in ${s.weaknessCategory} — wrong: "${s.example}", correct: "${s.correction}" | cardType: ${s.questionType} | explanation: ${s.meaning}`
  );

  const prompt = `Generate ${specs.length} feed cards for an English vocabulary learning app.
Each card is a micro-exercise embedded in a real-world text snippet.

CARD TYPES REQUESTED: ${JSON.stringify(cardTypes)}

CARD TYPE DEFINITIONS:
- "ab_natural": Show two versions of a sentence. One sounds native, one sounds textbook. User picks the natural one. Options array has exactly 2 items.
- "spot_flaw": Show a short argument (3-4 sentences). One has a logical flaw. User picks which flaw it has from 3-4 options.
- "spot_intruder": Show a paragraph. One sentence breaks the register/tone. User picks the intruder from 3-4 options.
- "retry": Reframed version of a previously failed question type. Same format as spot_flaw.
- "fix_it": Just a source content snippet that needs fixing. No options — this redirects to a full session.

SOURCE PLATFORM: ${sourcePlatform} (${sourceLabel})

Items:
${[...phraseLines, ...drillLines].join('\n')}

RULES:
1. sourceContent must feel like a REAL ${sourceLabel} — use appropriate length and style, BUT:
2. TONE RULE: Unless the card type is specifically testing register (like 'ab_natural' or 'spot_intruder'), make the tone casual, internet-slangy, dramatic, or highly opinionated. ABSOLUTELY DO NOT make the tone formal, corporate, or professional!
3. Embed any vocab words naturally (never define them)
4. options should be 2-4 items depending on card type
5. For fix_it cards, only provide sourceContent and prompt (no options)
6. explanation should be insightful and educational (1-2 sentences)

Return JSON array formatted exactly like this:
{
  "cards": [
    {
      "cardType": "spot_flaw",
      "sourceContent": "...",
      "prompt": "...",
      "options": ["...", "..."],
      "correctIndex": 0,
      "explanation": "...",
      "skillAxis": "cohesion|task_achievement|naturalness",
      "phraseId": "mapped phrase from input"
    }
  ]
}`;

  return {
    batch_request_id: `feed_quizzes_${userId}`,
    messages: [
      { 
        role: 'system', 
        content: 'You generate micro-exercises for English learners. Content should feel like real social media posts, emails, and messages. Respond ONLY with valid JSON.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4000
  };
}
