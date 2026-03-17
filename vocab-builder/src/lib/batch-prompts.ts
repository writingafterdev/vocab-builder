/**
 * Batch prompt builders for Grok API
 *
 * Generates prompts for:
 * - Article processing (phrase extraction, vocab, sections, lexile)
 * - Comprehensive exercise generation (quick practice, drill, immersive, bundles)
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

// 15 feed-friendly types (fit in 280px QuizCard) + 3 listening types
export const FEED_FRIENDLY_TYPES: string[] = [
  ...PHASE_QUESTION_TYPES.recognition,
  ...PHASE_QUESTION_TYPES.comprehension,
  ...PHASE_QUESTION_TYPES.guided_production,
  'listen_and_identify',
  'tone_by_voice',
  'dictation'
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
// ARTICLE PROCESSING PROMPT (unchanged)
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
// COMPREHENSIVE EXERCISE GENERATION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive exercise batch request for one user.
 * Generates ALL exercise content for a day in one request:
 * A) Quick Practice questions (phase-matched to learningStep)
 * B) Daily Drill (weakness-based, if weaknesses provided)
 * C) Immersive Session (reading + listening, if Step 3+ phrases ≥ 3)
 * D) Exercise Bundle (themed writing prompt)
 */
export function buildUserExerciseBatchRequest(
  userId: string,
  phrases: PhraseForBatch[],
  weaknesses: WeaknessForBatch[] = [],
): BatchRequest {
  // Group phrases by SRS phase
  const phrasesByPhase = new Map<string, PhraseForBatch[]>();
  for (const p of phrases) {
    const phase = getPhaseForStep(p.learningStep || 1);
    const group = phrasesByPhase.get(phase) || [];
    group.push(p);
    phrasesByPhase.set(phase, group);
  }

  // Build phrase list with phase info
  const phraseListByPhase = Array.from(phrasesByPhase.entries())
    .map(([phase, pList]) => {
      const types = PHASE_QUESTION_TYPES[phase];
      return `
### ${phase.toUpperCase()} PHASE (Steps ${phase === 'recognition' ? '1-2' : phase === 'comprehension' ? '3-4' : phase === 'guided_production' ? '5-6' : '7+'}):
Allowed question types: ${types.join(', ')}
Phrases:
${pList.map(p => `- id="${p.id}" phrase="${p.phrase}" meaning="${p.meaning || ''}" register="${p.register || 'neutral'}" step=${p.learningStep || 1}`).join('\n')}`;
    })
    .join('\n');

  // Step 3+ phrases for immersive
  const step3Plus = phrases.filter(p => (p.learningStep || 0) >= 3);
  const hasImmersive = step3Plus.length >= 3;

  // Weakness list for drill
  const weaknessList = weaknesses.length > 0
    ? weaknesses.map(w =>
      `- id="${w.id}" category="${w.category}" specific="${w.specific}" example="${w.examples[0]}" correction="${w.correction}"`
    ).join('\n')
    : '';

  const prompt = `You are an expert English language teacher. Generate a COMPLETE daily exercise package for this learner.

═══ USER'S DUE PHRASES BY SRS PHASE ═══
${phraseListByPhase}

═══ SECTION A: QUICK PRACTICE QUESTIONS ═══

For EACH phrase, generate 2-3 questions using ONLY the question types allowed for its phase.
Match each question to the correct interface:

**RECOGNITION types (Steps 1-2):**
- "social_consequence_prediction": { "storyExcerpt": "2-3 sentence story using phrase", "options": ["outcome1", "outcome2", "outcome3", "outcome4"], "correctIndex": 0-3, "explanation": "" }
- "situation_phrase_matching": { "context": "situation description", "prompt": "what was said", "options": ["phrase1", "phrase2", "phrase3", "phrase4"], "correctIndex": 0-3, "explanation": "" }
- "tone_interpretation": { "context": "situation", "dialogue": "speaker uses phrase", "question": "How does speaker feel?", "options": ["emotion1", "emotion2", "emotion3", "emotion4"], "correctIndex": 0-3, "explanation": "" }
- "contrast_exposure": { "phrase1": "", "phrase2": "", "context": "situation", "scenario1": "outcome with phrase1", "scenario2": "outcome with phrase2", "question": "", "explanation": "" }

**COMPREHENSION types (Steps 3-4):**
- "fill_gap_mcq": { "dialogue": [{"speaker":"","text":"","isBlank":false},...], "options": ["","","",""], "correctIndex": 0-3, "explanation": "" }
- "why_did_they_say": { "question": "", "options": ["","","",""], "correctIndex": 0-3, "explanation": "" }
- "error_detection": { "sentence": "sentence with mistake", "wrongWord": "", "options": ["correct1","correct2","correct3","correct4"], "correctIndex": 0-3, "explanation": "" }
- "appropriateness_judgment": { "phrase": "", "question": "When would you use this?", "options": ["situation1","situation2","situation3","situation4"], "correctIndex": 0-3, "explanation": "" }
- "register_sorting": { "phrases": ["p1","p2","p3"], "categories": ["Casual","Neutral","Formal"], "correctAssignment": {"p1":"Casual",...}, "explanation": "" }
- "reading_comprehension": { "passage": "short paragraph using phrase", "question": "", "options": ["","","",""], "correctIndex": 0-3, "explanation": "" }
- "sentence_correction": { "sentence": "sentence with subtle error", "options": ["fixed1","fixed2","fixed3","fixed4"], "correctIndex": 0-3, "explanation": "" }

**GUIDED PRODUCTION types (Steps 5-6):**
- "constrained_production": { "targetPhrase": "", "prompt": "Write a sentence using...", "hint": "", "context": "" }
- "transformation_exercise": { "originalPhrase": "", "originalRegister": "casual"|"formal", "targetRegister": "formal"|"casual", "prompt": "Make this more formal/casual", "hint": "" }
- "dialogue_completion_open": { "context": "", "dialogueBefore": "", "targetPhrase": "", "hint": "" }
- "text_completion": { "passage": "paragraph with 2-3 blanks", "blanks": [{"position":0,"hint":"","targetPhrase":""}], "explanation": "" }

**MASTERY types (Steps 7+):**
- "scenario_production": { "scenario": "full scenario description", "targetPhrase": "" }
- "explain_to_friend": { "targetPhrase": "", "prompt": "Explain when and how to use this phrase", "context": "" }
- "multiple_response_generation": { "context": "situation", "targetPhrase": "", "requiredCount": 2, "hint": "" }
- "creative_context_use": { "targetPhrase": "", "prompt": "Create your own situation", "constraints": "" }

Output format for each question:
{ "type": "question_type", "content": { ...matching interface above }, "targetPhraseIds": ["phrase_id"], "xpReward": 10-25 }

RULES:
- Never put correctIndex at the same position for all questions
- Make distractors plausible, not obviously wrong
- Each phrase MUST get 2-3 questions from its phase's allowed types
- Recognition: 1 clearly wrong + 2 plausible + 1 correct
- Comprehension: all options plausible, correct requires nuance
- Production: prompts should feel like real conversations, not school assignments

${weaknesses.length > 0 ? `
═══ SECTION B: DAILY DRILL ═══

Generate 2-3 drill exercises for these weaknesses:
${weaknessList}

Drill types by category:
- grammar → "grammar_fix": { "instruction": "", "prompt": "sentence with error", "options": ["fix1","fix2","fix3"], "correctAnswer": "", "explanation": "" }
- register → "register_choice": { "instruction": "", "prompt": "scenario", "options": ["response1","response2","response3"], "correctAnswer": "", "explanation": "" }
- nuance/pragmatics → "nuance_match": { "instruction": "", "prompt": "situation", "options": ["phrase1","phrase2","phrase3"], "correctAnswer": "", "explanation": "" }
- collocation → "collocation_fill": { "instruction": "", "prompt": "sentence with blank", "options": ["word1","word2","word3"], "correctAnswer": "", "explanation": "" }
` : ''}
${hasImmersive ? `
═══ SECTION C: IMMERSIVE SESSION ═══

Using these Step 3+ phrases:
${step3Plus.slice(0, 5).map(p => `- "${p.phrase}" (${p.meaning || ''})`).join('\n')}

Generate TWO pieces of content:
1. READING: A short article (150-250 words) naturally incorporating ALL phrases + 4 comprehension questions
2. LISTENING: A dialogue between 2 people (150-250 words) naturally incorporating ALL phrases + 4 comprehension questions

Each question: { "question": "", "options": ["A","B","C","D"], "correctAnswer": "A", "explanation": "" }
` : ''}
═══ SECTION D: EXERCISE BUNDLE ═══

Create ONE themed writing prompt that naturally calls for using ALL due phrases.
- Open-ended, 50-150 word expected response
- Feel like something a friend would ask
- Match the register of the majority of phrases

═══ FINAL OUTPUT ═══

Return ONLY this JSON:
{
  "questions": [
    { "type": "question_type", "content": { ... }, "targetPhraseIds": ["id"], "xpReward": 15 }
  ],
  ${weaknesses.length > 0 ? `"drills": [
    { "type": "drill_type", "weaknessId": "id", "weaknessCategory": "", "instruction": "", "prompt": "", "options": [], "correctAnswer": "", "explanation": "" }
  ],` : '"drills": [],'}
  ${hasImmersive ? `"immersiveSession": {
    "reading": { "title": "", "content": "", "questions": [...], "phrases": [{"phrase":"","meaning":"","id":""}] },
    "listening": { "title": "", "content": "", "questions": [...], "phrases": [{"phrase":"","meaning":"","id":""}] }
  },` : '"immersiveSession": null,'}
  "bundle": {
    "theme": "Short topic (2-4 words)",
    "question": "The writing prompt",
    "phrases": ["phrase1", "phrase2"],
    "hints": ["meaning1", "meaning2"]
  }
}`;

  return {
    batch_request_id: `exercises_${userId}`,
    messages: [
      {
        role: 'system',
        content: 'You are an expert English language teacher creating personalized daily exercises. Return valid JSON only. Every question must be engaging, authentic, and test real communicative competence — not textbook knowledge.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 16384,
  };
}

// Legacy: keep old function name for backward compat (will be removed)
export function buildExerciseBatchRequest(
  userId: string,
  clusterIndex: number,
  phrases: PhraseForBatch[]
): BatchRequest {
  return buildUserExerciseBatchRequest(userId, phrases);
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
