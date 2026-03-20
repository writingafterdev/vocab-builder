/**
 * Batch prompt builders for Grok API
 *
 * Generates prompts for:
 * - Article processing (phrase extraction, vocab, sections, lexile)
 * - Practice article generation (Substack-style articles with inline questions)
 * - Feed quiz generation (21 question types for swipeable cards)
 */

import type { BatchRequest } from './grok-batch';

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
 * Build a batch request to generate a Substack-style practice article
 * that weaves in all of a user's due vocabulary phrases.
 * Used by cron 1 (daily-import) for listening-day sessions.
 * Results are collected by cron 2 and saved to generatedSessions.
 */
export function buildPracticeArticleBatchRequest(
  userId: string,
  phrases: PhraseForBatch[],
  clusters: SimpleCluster[],
): BatchRequest {
  const phraseInventory = phrases.map(p =>
    `- "${p.phrase}" (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
  ).join('\n');

  const clusterDescriptions = clusters.map((c, i) =>
    `Group ${i + 1} [${c.topic}/${c.register}]: ${c.phrases.map(p => `"${p.phrase}"`).join(', ')}`
  ).join('\n');

  const phraseCount = phrases.length;
  const wordTarget = phraseCount <= 5 ? '400-600' :
                     phraseCount <= 10 ? '600-900' :
                     phraseCount <= 15 ? '900-1200' : '1200-1500';

  const questionsTarget = Math.min(Math.ceil(phraseCount * 0.6), 8);

  const prompt = `You are a Substack-style writer creating a compelling, immersive article. Your articles get readers hooked from the first line, tell stories that linger, and teach vocabulary through CONTEXT — never through definitions.

PHRASES TO WEAVE IN:
${phraseInventory}

THEMATIC GROUPS:
${clusterDescriptions}

YOUR TASK: Write ONE cohesive article that naturally incorporates ALL the phrases above. The article should feel like a real Substack post — engaging, opinionated, with a strong narrative voice.

CRITICAL RULES:

1. **STRUCTURE**: The article must flow through the thematic groups NATURALLY. Don't abruptly jump topics.
2. **CONTEXT LAYERING** (for each phrase): BEFORE, PHRASE, AFTER.
3. **TONE**: Write like a real person, not a textbook.
4. **LENGTH**: ${wordTarget} words, divided into 3-6 sections. Use the 'sections' array in the JSON response to break up the article into logical parts. Each section will be synthesized into a separate snippet of audio. Keep them reasonably short.
5. **COMPREHENSION QUESTIONS** (${questionsTarget} total): Test understanding of a specific phrase through story comprehension.
6. **EXTRACTABLE QUOTES**: Include 2-3 sentences that work as standalone quotes.

RESPOND IN JSON:
{
  "title": "A catchy, Substack-worthy title",
  "subtitle": "A compelling one-line hook",
  "sections": [
    {
      "id": "section_1",
      "content": "The full text of this section (multiple paragraphs OK)",
      "vocabPhrases": ["phrase1", "phrase2"]
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "afterSectionId": "section_2",
      "question": "Story-based comprehension question",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1,
      "targetPhrase": "the phrase being tested",
      "explanation": "Brief explanation"
    }
  ],
  "quotes": [
    {
      "text": "A vivid sentence",
      "highlightedPhrases": ["phrase that appears"]
    }
  ]
}`;

  return {
    batch_request_id: `practice_article_${userId}`,
    messages: [
      {
        role: 'system',
        content: 'You are an award-winning Substack writer who teaches vocabulary through immersive storytelling. You respond ONLY in valid JSON. Your writing is vivid, opinionated, and emotionally engaging.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
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
 * Builds a batch request to generate feed quizzes using 15 question types.
 * Each item specifies its questionType so the AI generates the right kind of content.
 * This runs daily to pre-generate swipeable quizzes based on due phrases & weaknesses.
 */
export function buildFeedQuizBatchRequest(
  userId: string,
  specs: FeedQuizSpec[]
): BatchRequest {
  // Separate phrases and drills to format them correctly in the prompt
  const phraseSpecs = specs.filter(s => s.source === 'phrase');
  const drillSpecs = specs.filter(s => s.source === 'drill');

  const phraseLines = phraseSpecs.map((s, i) => 
      `${i + 1}. PHRASE: "${s.phrase}" | meaning: ${s.meaning} | register: ${s.register} | questionType: ${s.questionType}`
  );
  
  const drillLines = drillSpecs.map((s, i) => 
      `${phraseSpecs.length + i + 1}. DRILL: weakness in ${s.weaknessCategory} — wrong: "${s.example}", correct: "${s.correction}" | questionType: ${s.questionType} | explanation: ${s.meaning}`
  );

  const prompt = `You are a master educator, expert linguist, and witty screenwriter. Generate ${specs.length} vocabulary exercises for a social media-style feed.

CORE RULES:
- Do NOT write dry, academic, "textbook" sentences.
- Every scenario must feel like a snippet from a movie script, a heated text message, a dramatic workplace email, or a relatable everyday frustration.
- Inject a SPECIFIC emotion: passive-aggression, panic, awe, outrage, sarcasm, desperation, tenderness, exasperation, smugness, etc.
- Use authentic, modern phrasing matched to the register (casual roommate argument vs. corporate meeting vs. late-night DM).
- Show, don't tell: instead of "she was angry," describe her slamming a laptop shut.
- Wrong options should be TEMPTINGLY plausible — the kind of mistake a smart learner would make.
- Keep scenarios SHORT (max 50 words) — these are mobile cards, not essays.

Items:
${[...phraseLines, ...drillLines].join('\n')}

Each item specifies a "questionType". Generate the question matching that type:

== MCQ TYPES (3 options, one correct) ==
- "social_consequence_prediction": Scene using the phrase → "What happens next?" (3 outcomes)
- "situation_phrase_matching": Describe a situation → "Which phrase fits best?" (3 phrases)
- "fill_gap_mcq": Sentence with ___ → 3 word choices to fill the gap
- "why_did_they_say": Quote using the phrase → "Why did they say this?" (3 motivations)
- "appropriateness_judgment": Sentence using the phrase → "Is this usage appropriate here?" (3 judgments)
- "reading_comprehension": Short passage with the phrase → inference question (3 answers)
- "sentence_correction": Sentence with subtle error → "Pick the correct version" (3 rewrites)

== SPECIAL INTERACTION TYPES ==
- "tone_interpretation": Scene using the phrase naturally → "What tone is the speaker using?" — provide 3 emotion labels as options (e.g. "Sarcastic", "Sincere", "Passive-aggressive")
- "error_detection": Sentence with the phrase MISUSED → "What's wrong?" — option[0] = the wrong word/phrase, option[1] = the correction, option[2] = brief explanation. Set correctIndex to 1.
- "contrast_exposure": Two similar phrases that differ in nuance → option[0] = phrase A, option[1] = phrase B, option[2] = the key difference. Scenario asks "What's the difference?"
- "register_sorting": Give 3 versions of the same idea at different registers → options = [casual, neutral, formal] in SCRAMBLED order. correctIndex = index of the correct casual→formal ordering (0 if already sorted, or whichever represents correct order).

== TYPE-IN TYPES (user types a short answer) ==
For these, the user will TYPE their answer (not select). Still provide options[] with the ideal answer at correctIndex so the system can check:
- "constrained_production": Sentence with ___ → user types the missing word. options = [correct_word, wrong_word_1, wrong_word_2], correctIndex = 0.
- "transformation_exercise": Show a formal sentence → "Rewrite casually" (or vice versa). options = [ideal_rewrite, alt_1, alt_2], correctIndex = 0.
- "dialogue_completion_open": Dialogue with last line missing → user types reply. options = [ideal_reply, alt_1, alt_2], correctIndex = 0.
- "text_completion": Paragraph with one ___ → user types the word. options = [correct, wrong_1, wrong_2], correctIndex = 0.

== LISTENING EXERCISES (Grok TTS) ==
For these types, the 'scenario' MUST include Grok TTS speech tags combining ONLY these exactly:
Inline: [pause], [long-pause], [hum-tune], [laugh], [chuckle], [giggle], [cry], [tsk], [tongue-click], [lip-smack], [breath], [inhale], [exhale], [sigh]
Wrapping: <soft>, <whisper>, <loud>, <build-intensity>, <decrease-intensity>, <higher-pitch>, <lower-pitch>, <slow>, <fast>, <sing-song>, <singing>, <laugh-speak>, <emphasis>
Example scenario: "[sigh] <slow><lower-pitch>I really can't believe he said that.</lower-pitch></slow>"

- "listen_and_identify": Scenario uses the phrase with heavy emotion tags. options = ["The phrase used", "Distractor 1", "Distractor 2"], correctIndex = 0. Identify the target phrase heard.
- "tone_by_voice": Scenario uses the phrase with heavy emotion tags. options = ["Sarcasm", "Joy", "Panic"], correctIndex = 0. Identify the tone of voice.
- "dictation": Scenario uses the phrase. The user types what they hear. options = ["The exact phrase", "Wrong", "Wrong"], correctIndex = 0.

Return a JSON object { "questions": [...] } with one entry per item in the exact order requested:
{
  "questions": [
    {
      "phraseIndex": 0,
      "questionType": "fill_gap_mcq",
      "emotion": "one-word emotion tag, e.g. sarcasm, panic, tenderness",
      "scenario": "Vivid micro-story (2-3 sentences, max 50 words).",
      "options": ["Option A", "Option B", "Option C"],
      "correctIndex": 0,
      "explanation": "Quick, warm debrief — like a friend explaining it over coffee (1 sentence)"
    }
  ]
}`;

  return {
    batch_request_id: `feed_quizzes_${userId}`,
    messages: [
      { 
        role: 'system', 
        content: 'You are a master educator, expert linguist, and witty screenwriter. You create emotionally vivid vocabulary exercises for a social media-style card feed. Each exercise must match the specified questionType exactly. Return valid JSON only.' 
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4000
  };
}
