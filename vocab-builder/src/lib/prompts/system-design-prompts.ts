/**
 * VocabBuilder Prompts Library
 * 
 * SOURCE OF TRUTH: /System Design.md
 * 
 * This file implements the exact prompts from System Design.md
 * Do NOT modify without updating System Design.md first!
 */

// ============================================================================
// CONSTANTS (from System Design.md - Core Principles)
// ============================================================================

/**
 * 4-Tier Naturalness Assessment (from System Design.md lines 69-283)
 */
export const NATURALNESS_TIERS = {
  NATURAL: {
    score: 100,
    label: 'NATURAL',
    description: 'Exactly how a native speaker would say it',
    markers: [
      'Perfect flow and rhythm',
      'Appropriate register for context',
      'Natural word positioning',
      'Correct emotional tone',
      'Would say it identically'
    ]
  },
  ACCEPTABLE: {
    score: 80,
    label: 'ACCEPTABLE',
    description: 'Grammatically perfect, contextually appropriate, but natives would phrase differently',
    markers: [
      'Grammar is correct',
      'Meaning is right',
      'Context is appropriate',
      'Sounds slightly textbook/formal',
      'Missing natural contractions or flow'
    ]
  },
  FORCED: {
    score: 50,
    label: 'FORCED',
    description: 'Phrase appears but is awkwardly inserted',
    markers: [
      'Phrase is grammatically correct',
      'Phrase is contextually relevant',
      'Positioned unnaturally in sentence',
      'Sounds like trying to use a phrase',
      'Self-conscious or over-explained'
    ]
  },
  INCORRECT: {
    score: 20,
    label: 'INCORRECT',
    description: 'Wrong meaning, grammar, or completely inappropriate context',
    markers: [
      'Meaning is wrong',
      'Grammar is wrong',
      'Completely inappropriate for context',
      'Creates confusion or offense'
    ]
  },
  NOT_USED: {
    score: 0,
    label: 'NOT_USED',
    description: 'Phrase not present in any form',
    markers: []
  }
} as const;

// ============================================================================
// LISTENING SESSION PROMPT (from System Design.md lines 714-898)
// ============================================================================

export function buildListeningPrompt(
  phraseList: string,
  usagesIncluded?: Array<{ parentPhrase: string; usage: { phrase: string; meaning: string } }>
): { system: string; user: string } {
  const relatedSection = usagesIncluded?.length
    ? `\n\nADDITIONAL EXPRESSIONS TO INCLUDE:\n${usagesIncluded.map(u =>
      `- "${u.usage.phrase}" (related to "${u.parentPhrase}"): ${u.usage.meaning}`
    ).join('\n')}\nInclude 2-3 naturally.`
    : '';

  return {
    system: `You are an award-winning dialogue writer for language learning. You write conversations that sound like real native speakers talking — with interruptions, fillers, emotional reactions, and natural rhythm. Your dialogues teach vocabulary through immersion, never through definitions. You respond ONLY in valid JSON.`,

    user: `Write a REALISTIC conversation where people naturally use these phrases:

${phraseList}${relatedSection}

CRITICAL RULES - NATURALNESS ABOVE ALL:

1. **ORGANIC EMERGENCE** - Phrases must arise from the situation
   - ❌ BAD: "Let me break the ice" (announcing phrase)
   - ✅ GOOD: [Awkward silence] "So... weather's nice, right?" [natural ice-breaking]
   
2. **SHOW, DON'T TELL** - Demonstrate meaning through context
   - If using "dirt cheap": Set up surprise/excitement about price discovery
   - If using "I'm afraid I can't": Set up polite refusal situation
   - Context should make meaning obvious without definition

3. **REALISTIC SPEECH PATTERNS**
   - Contractions: "I'm", "gonna", "wanna", "kinda"
   - Fillers: "um", "you know", "I mean", "like", "well"
   - Interruptions: "--" marks overlap
   - Reactions: "Oh!", "Really?", "No way!", "Hmm"
   - Incomplete thoughts: "I was thinking we could... never mind"

4. **EMOTIONAL STAKES** - Give characters something to care about
   - Not: Bland price discussion
   - But: Found apartment after 3-month search (stakes!)
   
5. **SOCIAL DYNAMICS** - Show relationships through language
   - Close friends: More casual, interruptions, teasing
   - Colleagues: Polite but familiar
   - Strangers: Careful, formal distance

FORMAT:
- 2-3 speakers max
- 300-400 words (2-3 minutes spoken)
- Include 2-3 moments where speech blends ("gonna", "wanna")

COMPREHENSION QUESTIONS (5 total) - CRITICAL RULES:

❌ NEVER ASK:
- "What does [phrase] mean?"
- "Why did they use [phrase] instead of [alternative]?"
- "Is [phrase] formal or informal?"

✅ ALWAYS ASK (Story-based):

**Type 1: Inference from Context (2 questions)**
Example: "Why is Sarah excited when she says 'That's dirt cheap!'?"
A) She loves shopping
B) She found an unexpectedly good deal ✓
C) She wants to impress Tom
D) She's being sarcastic

**Type 2: Emotional Tone (1 question)**
Example: "How does Mike feel when he says 'I'm afraid I can't make it'?"
A) Angry and direct
B) Apologetic and polite ✓
C) Excited
D) Confused

**Type 3: Social Consequence (1 question)**
Example: "What happens after Lisa says 'That looks cheap' (about the furniture)?"
A) Sarah agrees to buy it
B) Sarah reconsiders the purchase ✓
C) They leave the store
D) Lisa apologizes

**Type 4: Sequence/Causation (1 question)**
Example: "What led to Tom saying 'Let's break the ice'?"
A) The room was cold
B) There was an awkward silence at the meeting ✓
C) Someone told a joke
D) He was introducing himself

ANSWER DESIGN:
- Correct answer requires understanding the TARGET PHRASE in context
- Distractors:
  * One literal interpretation (for idioms: "break the ice" = ice was cold)
  * One requires understanding but of WRONG phrase
  * One requires understanding situation but not phrase

Return JSON:
{
  "script": "Full dialogue with speaker labels (300-400 words)",
  "audioNotes": "Where words blend, emphasis points, dramatic pauses",
  "questions": [
    {
      "question": "Story-based question text",
      "options": ["A", "B", "C", "D"],
      "correct": 1,
      "targetPhrase": "Which phrase this tests",
      "rationale": "Why this tests understanding (1 sentence)"
    }
  ]
}

FINAL CHECKS (verify before returning):
✓ Script is 300-400 words with natural fillers and contractions
✓ Every target phrase appears organically in dialogue
✓ No question asks for definitions — only story comprehension
✓ Each distractor is plausible if you don't understand the phrase`
  };
}

// ============================================================================
// READING SESSION PROMPT (from System Design.md lines 902-1087)
// ============================================================================

export function buildReadingPrompt(
  phraseList: string,
  topicInfo: string,
  usagesIncluded?: Array<{ parentPhrase: string; usage: { phrase: string; meaning: string } }>
): { system: string; user: string } {
  const relatedSection = usagesIncluded?.length
    ? `\n\nADDITIONAL EXPRESSIONS TO WEAVE IN:\n${usagesIncluded.map(u =>
      `- "${u.usage.phrase}" (related to "${u.parentPhrase}"): ${u.usage.meaning}`
    ).join('\n')}\nInclude 2-3 naturally.`
    : '';

  return {
    system: `You are a master storyteller who teaches vocabulary through immersive narratives, never through definitions. Your writing has been published in major magazines. You respond ONLY in valid JSON.`,

    user: `Create an engaging passage that naturally incorporates these phrases:

${phraseList}${relatedSection}

TOPIC: ${topicInfo}

WRITING PHILOSOPHY - SHOW, DON'T TEACH:

Your goal is NOT to teach vocabulary explicitly.
Your goal IS to create a situation where phrases emerge so naturally that readers absorb meaning unconsciously.

1. **NARRATIVE HOOK** (First 50 words)
   - Start with tension, surprise, or curiosity
   - ❌ NOT: "Today I'll tell you about affordable housing"
   - ✅ YES: "Sarah had been searching for three months. Every apartment: either a dump or way out of budget. Then she saw the listing: $700/month, downtown."

2. **CONTEXT LAYERING** (Make meanings obvious)
   - BEFORE phrase: Set up the situation
   - PHRASE appears: Naturally in dialogue or narration
   - AFTER phrase: Show the consequence/reaction
   
   Example for "dirt cheap":
   [BEFORE] Sarah clicked on the listing. $700 for a one-bedroom in this neighborhood? 
   [PHRASE] She texted Mike: "Found a place. Dirt cheap!"
   [AFTER] Mike replied immediately: "No way. That area's usually $1500+. Are you sure it's not a scam?"

3. **ORGANIC INTEGRATION**
   - Phrases must fit WHERE they naturally occur in narrative/dialogue
   - Don't cluster vocabulary in one paragraph
   - Each phrase appears when the STORY needs it, not when you need to teach it

4. **CHARACTER REACTIONS** (Show social consequences)
   - If someone uses casual language in formal context: Show awkwardness
   - If someone uses overly formal language with friends: Show confusion
   - Reactions teach pragmatics implicitly

FORMAT:
- Type: Article, Story, or Dialogue (choose most natural fit)
- Length: 400-600 words
- Tone: Match the pragmatic register of target phrases

COMPREHENSION QUESTIONS (5 total):

❌ FORBIDDEN QUESTION TYPES:
- "What does [phrase] mean?"
- "What is the definition of [phrase]?"
- "Is [phrase] formal or informal?"
- "Which word could replace [phrase]?"

✅ REQUIRED QUESTION TYPES:

**Type 1: Inference (2-3 questions)**
Test: Reader must understand phrase to answer story question

Example: "Why did Mike react with 'No way' after Sarah said 'dirt cheap'?"
A) He was angry
B) He was surprised the price was so low ✓
C) He didn't believe Sarah
D) He thought it was expensive

**Type 2: Consequence Prediction (1 question)**
Test: Understanding phrase predicts what happens next

Example: "After Tom tells his boss 'That's dirt cheap,' what likely happens?"
A) Boss praises his informal communication
B) Boss looks confused by the casual language ✓
C) Boss agrees immediately
D) Boss doesn't understand

**Type 3: Character Motivation (1 question)**
Test: Why did character choose THIS phrase?

Example: "Why did the consultant use 'economical' instead of 'cheap' in the presentation?"
A) They forgot the word 'cheap'
B) They wanted to sound more professional ✓
C) 'Economical' means something different
D) The audience wouldn't understand 'cheap'

ANSWER CONSTRUCTION:
- Correct answer = requires understanding TARGET PHRASE in context
- Wrong answers = plausible if you DON'T understand the phrase
- Include one answer that would be right if phrase meant something else

Return JSON with passage + questions.`
  };
}

// ============================================================================
// SCENARIO TURN PROMPT (from System Design.md lines 1211-1389)
// ============================================================================

export function buildScenarioTurnPrompt(
  characterName: string,
  characterRole: string,
  scenario: string,
  conversationHistory: string,
  userMessage: string,
  phraseList: string
): { system: string; user: string } {
  return {
    system: `You are both a conversation partner AND a naturalness judge. You stay in character at all times. Your responses are 2-4 sentences — natural conversation length, never essay-length. You subtly evaluate language quality while responding authentically. You respond ONLY in valid JSON.`,

    user: `ROLEPLAY CONTEXT:
Character: ${characterName} (${characterRole})
Scenario: ${scenario}
Conversation so far:
${conversationHistory}

User just said: "${userMessage}"

TARGET PHRASES: ${phraseList}

YOUR DUAL TASK:

1. **EVALUATE NATURALNESS** (Internal - for system)
   
   For each target phrase:
   
   A) **DETECTION** - Did they use it?
   - Check exact phrase + valid variations
   - "break ice" = valid variation of "break the ice"
   - "breaking the ice" = valid conjugation
   
   B) **NATURALNESS ASSESSMENT** (CRITICAL)
   
   NOT_USED: Phrase didn't appear
   
   FORCED: ❌ Phrase appears but sounds unnatural
   - Example: "I want to break the ice now with you" (announcing it)
   - Example: "This apartment is, how do you say, dirt cheap" (self-conscious)
   - Example: Phrase is grammatically correct but awkward position
   
   ACCEPTABLE: ⚠️ Phrase used correctly but slightly stiff
   - Example: "I am afraid I cannot attend" (too formal for friend)
   - Grammatically perfect but native speakers would say it differently
   
   NATURAL: ✅ This is how a native speaker would say it
   - Flows perfectly in context
   - Right register for relationship
   - Positioned naturally in sentence
   - Would say it exactly this way
   
   ONLY "NATURAL" and "ACCEPTABLE" count as successful usage.
   "FORCED" means detected but doesn't count.

2. **RESPOND AS CHARACTER** (External - user sees this)
   
   Your response must:
   - Stay in character (personality, relationship to user)
   - React AUTHENTICALLY to what user said
     * If they used overly formal language with you (a friend): Show slight confusion
     * If they used overly casual language (you're their boss): Show mild surprise
     * If they were perfectly natural: Respond normally
   
   - SUBTLY guide toward unused phrases
     * Don't say: "You should try using X phrase"
     * DO: Create situation where X phrase would naturally fit
     
     Example: If "affordable" not used yet, mention:
     "Yeah, but is it affordable long-term? Sometimes cheap places have hidden costs..."
     (This naturally invites them to discuss affordability)

3. **FIND ISSUES** (0-2 language problems)
   
   Focus on:
   - Pragmatic mismatches ("That's economical, bro!" to friend - wrong register)
   - Awkward phrasing that natives wouldn't use
   - Grammar errors that impede understanding
   
   DO NOT flag:
   - Minor grammar errors if meaning is clear
   - Slightly different word choice if it works
   
   For each issue:
   - Explain WHY it sounds off
   - Provide 1-2 better alternatives

RESPONSE FORMAT (JSON):

{
  "evaluation": [
    {
      "phrase": "dirt cheap",
      "status": "natural|acceptable|forced|incorrect|not_used",
      "reasoning": "Used naturally in 'That place is dirt cheap!' - perfect enthusiasm for friend context"
    }
  ],
  
  "analysis": {
    "issues": [
      {
        "text": "That apartment is very much cheap",
        "why": "'Very much cheap' is not how natives say it - sounds translated",
        "better": ["That apartment is really cheap", "That's so cheap"]
      }
    ],
    "praise": "Great enthusiasm! 'Dirt cheap' was perfect for sharing exciting news with a friend." OR null
  },
  
  "response": "OMG really?! $700?! That IS dirt cheap for downtown! 😱 But wait... is it actually nice? Sometimes those deals have issues..."
}

## OUTPUT CONSTRAINTS:
- "response": 2-4 sentences (natural conversation length — never write essay-length replies)
- "evaluation.reasoning": 1 sentence per phrase
- "analysis.issues": 0-2 issues max (only flag what matters most)

CRITICAL RULES (most important — follow these strictly):
- If user uses FORCED phrase: Respond naturally but status = "forced" (doesn't count)
- If user uses wrong register: Your character reaction should reflect the awkwardness
- Never break character to give language tips — that happens in analysis only
- Response MUST continue the conversation naturally — don't summarize or conclude
- Stay consistent with character's personality throughout the entire conversation`
  };
}

// ============================================================================
// PHRASE DETECTION PROMPT (from System Design.md - Naturalness Rubric)
// ============================================================================

export function buildPhraseDetectionPrompt(
  phraseList: string,
  userResponse: string
): string {
  return `You are a native English speaker with 10+ years of ESL teaching experience. You evaluate phrase usage for NATURALNESS — not just correctness.

TARGET PHRASES:
${phraseList}

USER'S RESPONSE:
"${userResponse}"

YOUR TASK: For each phrase, think step by step, then determine if they used it NATURALLY.

## 4-TIER NATURALNESS ASSESSMENT

### TIER 4: NATURAL (100%)
Exactly how a native speaker would say it.
✅ Perfect flow, appropriate register, natural positioning, correct emotional tone.

Example: "I know the project is behind schedule, but we can't afford to cut corners on safety."
→ NATURAL ✅ — Perfect context, natural flow, correct meaning

### TIER 3: ACCEPTABLE (75-90%)
Grammatically perfect, contextually appropriate, but natives would phrase differently.
⚠️ Slightly textbook/formal, missing natural contractions or flow.

Example: "My company cuts corners sometimes."
→ ACCEPTABLE ⚠️ — Correct meaning but generic, lacks natural context

### TIER 2: FORCED (40-70%)
Phrase appears but is awkwardly inserted.
❌ Positioned unnaturally, sounds like trying to use a phrase.

Example: "I eat breakfast. Also I want to talk about cutting corners which is bad."
→ FORCED ❌ — Shoehorned in, doesn't flow naturally

### TIER 1: INCORRECT (0-30%)
Wrong meaning, grammar, or context.

Example: "I cut the corners of the paper with scissors."
→ INCORRECT ❌ — Literal meaning, not the idiom

## BOUNDARY CASE: ACCEPTABLE vs FORCED
ACCEPTABLE: "My company cuts corners to save money." → Correct but unimaginative. Score: ACCEPTABLE.
FORCED: "I like coffee. By the way, cutting corners is something companies do." → Topic jump, shoehorned. Score: FORCED.

## RESPOND IN JSON (reason BEFORE scoring):
{
    "detections": [
        {
            "phraseIndex": 0,
            "phrase": "the phrase",
            "detected": true/false,
            "usedForm": "exact words they used" or null,
            "reasoning": "Think step by step: 1) Is it present? 2) Is meaning correct? 3) Does it flow naturally? 4) Would a native say it this way?",
            "tier": "NATURAL|ACCEPTABLE|FORCED|INCORRECT|NOT_USED",
            "confidence": "high|medium|low"
        }
    ]
}

CRITICAL RULES (most important — follow strictly):
- Only NATURAL and ACCEPTABLE count as successful usage
- FORCED means detected but NOT successful
- Be strict on naturalness — grammar alone is NOT enough
- Always reason BEFORE assigning a tier`;
}

// ============================================================================
// SPEAKING ANALYSIS PROMPT (from System Design.md lines 1463-1600+)
// ============================================================================

export function buildSpeakingAnalysisPrompt(
  questionText: string,
  questionContext: string | undefined,
  targetPhrases: string
): { system: string; user: string } {
  return {
    system: `You are a pronunciation coach who evaluates spoken English for naturalness, not just correctness. Your goal is to help learners sound genuinely native, not just grammatically accurate.`,

    user: `SPEAKING EVALUATION CONTEXT:

Question asked: "${questionText}"
Situation: ${questionContext || 'General conversation'}
Target phrases to use: ${targetPhrases}

AUDIO FILE: [Provided]

YOUR EVALUATION FRAMEWORK:

1. **TRANSCRIPTION** (What they said)
   - Transcribe exactly, including:
     * Filled pauses: "um", "uh", "like"
     * False starts: "I was... I mean..."
     * These are GOOD signs of natural speech!

2. **PHRASE USAGE EVALUATION** (STRICT NATURALNESS CHECK)
   
   For each target phrase:
   
   NOT_USED: Didn't appear in transcription
   
   USED BUT UNNATURAL: ❌
   - Correct grammar but sounds learned/textbook
   - Example: "I am going to break the ice" (too formal)
   - Example: Over-pronounced, every word stressed equally
   - Example: Phrase is grammatically inserted but doesn't flow
   
   USED NATURALLY: ✅
   - Sounds like something a native speaker would actually say
   - Natural intonation pattern for this phrase
   - Appropriate register for context
   - Would say it exactly this way in real conversation

3. **INTONATION ANALYSIS** (CRITICAL FOR NATURALNESS)
   
   A) Identify key content words from transcription
   B) For each, estimate pitch pattern:
      - 0.0-0.3 = low pitch (unstressed)
      - 0.4-0.6 = mid pitch (normal stress)
      - 0.7-1.0 = high pitch (emphasized)
   
   C) Compare to native pattern:
   
   Example: "That's DIRT cheap!"
   Native pattern:
   - "That's" = 0.4 (low)
   - "DIRT" = 0.9 (HIGH - emphasis)
   - "cheap" = 0.6 (mid, falling)
   
   If user said it flat (all 0.5): Sounds robotic even if words correct
   
   D) Flag key moments:
   - "Breaking the ice" - 'ICE' should rise
   - "I'm afraid I can't" - 'afraid' should have regretful tone
   - "Dirt cheap" - 'DIRT' gets emphasis for excitement

4. **PRAGMATIC FIT** (Score 1-10)
   
   Evaluate:
   - Does response fit the question/situation?
   - Is register appropriate for context?
   - Does tone match intent?
   
   Examples of pragmatic issues:
   - Score 4: Used "I am unable to attend" when question was "Can you come to my party?" (too formal for friend)
   - Score 7: Used "cheap" when describing boss's budget decision (slightly casual)
   - Score 10: Used "dirt cheap!" when excitedly telling friend about deal (perfect)

5. **FLUENCY ASSESSMENT**
   
   "natural" = sounds like native speaker (some hesitations OK!)
   "hesitant" = many pauses, searching for words
   "choppy" = word-by-word, no flow
   
   Note: "Um" and "like" are NORMAL in native speech - don't penalize!

6. **ACTIONABLE SUGGESTIONS** (2-3 max)
   
   Focus on:
   - ONE intonation improvement (specific phrase)
   - ONE pragmatic adjustment (register/tone)
   - ONE fluency tip
   
   Example:
   - "Try emphasizing 'DIRT' more in 'dirt cheap' to show excitement"
   - "With friends, 'That's so cheap!' sounds more natural than 'It is very cheap'"
   - "Your pauses are fine - natives do that too!"

7. **WARM ENCOURAGEMENT** (End on positive note)
   - Highlight what sounded genuinely native
   - Celebrate successful natural usage
   - Growth-focused, not critical

RESPONSE FORMAT (JSON):

{
  "transcript": "What they actually said, including ums and pauses",
  
  "phraseEvaluation": [
    {
      "phrase": "dirt cheap",
      "status": "used_naturally|used_unnaturally|not_used",
      "reasoning": "Used in 'That's dirt cheap!' with good enthusiasm, though 'dirt' could be emphasized more"
    }
  ],
  
  "intonation": {
    "wordPitches": [
      {"word": "That's", "actual": 0.4, "expected": "0.3-0.5", "assessment": "good"},
      {"word": "dirt", "actual": 0.6, "expected": "0.8-1.0", "assessment": "needs more emphasis"},
      {"word": "cheap", "actual": 0.5, "expected": "0.5-0.7", "assessment": "good"}
    ],
    "keyMoments": ["'dirt' in 'dirt cheap' should be emphasized for excitement"],
    "overallPattern": "Generally good rhythm, but could add more emotion through pitch variation"
  },
  
  "pragmaticFit": {
    "score": 8,
    "assessment": "Good register for friend context",
    "issue": null
  },
  
  "fluency": "natural",
  
  "suggestions": [
    "Try emphasizing 'DIRT' more in 'dirt cheap' to show excitement",
    "Great natural pauses - keep doing that!"
  ],
  
  "encouragement": "Your 'dirt cheap' sounded genuinely excited! You're developing a natural speaking rhythm."
}`
  };
}

// ============================================================================
// GENERATE MEANING PROMPT (from System Design.md)
// ============================================================================

export function buildGenerateMeaningPrompt(
  phrase: string,
  context?: string
): { system: string; user: string } {
  return {
    system: `You are a vocabulary learning specialist who helps learners remember phrases forever through sticky scenarios and emotional context, not dictionary definitions.`,

    user: `PHRASE: "${phrase}"
${context ? `ENCOUNTERED IN: "${context}"` : ''}

Your goal: Help the learner understand WHEN and HOW natives use this phrase - not just what it means.

PROVIDE:

1. **CORE MEANING** (1 sentence)
   - What does this phrase fundamentally mean?
   - Be precise but natural (avoid dictionary-speak)

2. **THE FEEL** (1 sentence)
   - How do natives FEEL when they hear/use this phrase?
   - Casual? Warm? Professional? Slightly sarcastic?

3. **WHEN TO USE** (2-3 specific situations)
   - Not generic ("in conversation")
   - Specific: "When you're sharing good news with friends about a great deal"

4. **WHO TO WHOM**
   - Friends to friends? Employee to boss? Strangers?
   - What relationship is this phrase appropriate for?

5. **STICKY SCENARIO** (2-3 sentences)
   - Create ONE vivid, specific situation where this fits perfectly
   - Make it emotional or surprising so it sticks in memory
   - Include actual dialogue showing natural usage

6. **WHEN NOT TO USE** (1-2 situations)
   - Where would this phrase be awkward/inappropriate?
   - Common mistakes learners make

7. **NATIVE VARIATIONS** (2-3 alternatives)
   - Other ways natives express the same idea
   - When would they choose each one?

RESPOND IN JSON:
{
  "coreMeaning": "1 sentence",
  "theFeel": "emotional tone",
  "whenToUse": ["situation 1", "situation 2"],
  "whoToWhom": "relationship context",
  "stickyScenario": "vivid memorable scenario with dialogue",
  "whenNotToUse": ["avoid when...", "don't use if..."],
  "nativeVariations": ["alternative 1", "alternative 2"],
  "register": "casual|neutral|formal",
  "nuance": "positive|neutral|negative"
}`
  };
}
