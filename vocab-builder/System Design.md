# System Design

# 📘 COMPLETE VOCABBUILDER AI PROMPT SYSTEM

**Purpose:** Comprehensive prompt library for AI-assisted vocabulary acquisition

---

# <a name="core-principles"></a>CORE PRINCIPLES

## The VocabBuilder Philosophy

**Five Pillars of Natural Language Acquisition:**

### 1. Naturalness Over Correctness

```other
❌ WRONG: "Is this grammatically correct?"
✅ RIGHT: "Would a native speaker say this exactly?"

Grammar accuracy: 60% weight
Natural fluency: 40% weight
→ Combined naturalness score

A slightly ungrammatical but natural response beats 
a perfect but robotic response.
```

### 2. Implicit Learning Through Story

```other
❌ WRONG: "What does 'dirt cheap' mean?"
✅ RIGHT: "Why is Sarah excited when she says 'dirt cheap'?"

Never test explicit knowledge.
Always test understanding through inference.
```

### 3. Social Consequences Teach Pragmatics

```other
❌ WRONG: "This phrase is informal"
✅ RIGHT: "Boss looks confused when you say 'dirt cheap'"

Show character reactions → User learns social appropriateness
No explicit teaching of register/formality
```

### 4. Progressive Difficulty Matched to SRS

```other
Review 1-2: Recognition (observe, predict)
Review 3-4: Comprehension (understand why)
Review 5-6: Guided Production (use with hints)
Review 7+: Free Production (natural activation)
```

### 5. Context Creates Meaning

```other
Phrases must emerge from situations, never be announced.

❌ "I'm going to break the ice now"
✅ [Awkward silence] "So... crazy weather, huh?"
```

---

# <a name="naturalness-rubric"></a>UNIVERSAL NATURALNESS RUBRIC

## The 4-Tier Assessment System

Use this rubric for ALL evaluation prompts.

### TIER 4: NATURAL (100% - Native-like)

**Definition:** Exactly how a native speaker would say it

**Recognition markers:**

- ✅ Perfect flow and rhythm
- ✅ Appropriate register for context
- ✅ Natural word positioning
- ✅ Correct emotional tone
- ✅ Would say it identically

**Examples:**

```other
SCENARIO: Friend shows apartment listing at $700/month in expensive city

NATURAL responses:
- "OMG that's dirt cheap!" 
  → Enthusiasm, casual tone, perfect for friend
  
- "Whoa, that's so cheap for this area!"
  → Natural excitement, appropriate intensity
  
- "No way! That's dirt cheap! 😱"
  → Text-appropriate, emoji adds authenticity

SCENARIO: Declining boss's Saturday work request

NATURAL responses:
- "I'm afraid I can't - I have a family commitment that day"
  → Polite, professional, specific reason
  
- "Unfortunately, I won't be able to. I have prior plans"
  → Formal, respectful, maintains relationship
  
SCENARIO: Casual friend asking to borrow money

NATURAL responses:
- "Sorry dude, I'm broke right now"
  → Casual, direct, appropriate for close friend
  
- "Ah man, I can't - I'm tight on cash myself"
  → Sympathetic, casual, honest
```

---

### TIER 3: ACCEPTABLE (75-90% - Slightly stiff but correct)

**Definition:** Grammatically perfect, contextually appropriate, but natives would phrase it differently

**Recognition markers:**

- ✅ Grammar is correct
- ✅ Meaning is right
- ✅ Context is appropriate
- ⚠️ Sounds slightly textbook/formal
- ⚠️ Missing natural contractions or flow

**Examples:**

```other
SCENARIO: Friend shows apartment deal

ACCEPTABLE responses:
- "That is very cheap"
  → Should be "That's so cheap!" - missing contraction + intensity
  
- "It is quite inexpensive"
  → Correct but too formal for friend - sounds translated
  
- "I think that is a good price"
  → True but lacks excitement - misses emotional tone

SCENARIO: Declining boss's request

ACCEPTABLE responses:
- "I am afraid I cannot make it"
  → Should be "I'm afraid I can't" - missing contractions
  
- "I am unable to attend on Saturday"
  → Correct but overly formal - sounds corporate template

SCENARIO: Casual friend texting

ACCEPTABLE responses:
- "I cannot come to the party"
  → Should be "Can't make it, sorry!" - too formal for text
  
- "I am sorry but I have other plans"
  → Grammatically fine but stiff for casual friend
```

---

### TIER 2: FORCED (40-70% - Present but unnatural)

**Definition:** Phrase appears but is awkwardly inserted, announcing itself rather than flowing naturally

**Recognition markers:**

- ⚠️ Phrase is grammatically correct
- ⚠️ Phrase is contextually relevant
- ❌ Positioned unnaturally in sentence
- ❌ Sounds like trying to use a phrase
- ❌ Self-conscious or over-explained

**Examples:**

```other
SCENARIO: Sharing deal with friend

FORCED responses:
- "I want to tell you that this is dirt cheap"
  → Phrase is announced, not naturally expressed
  
- "This apartment, which is dirt cheap, is available"
  → Formal construction - sounds like essay, not speech
  
- "What you would call dirt cheap, only $700"
  → Self-conscious insertion - "what you would call"
  
- "Let me use the phrase dirt cheap to describe it"
  → Explicitly announcing phrase usage

SCENARIO: Declining invitation

FORCED responses:
- "I want to say that I am afraid I cannot attend"
  → "I want to say that" = unnecessary preamble
  
- "As they say, I'm afraid I can't make it"
  → "As they say" = announcing idiom usage
  
- "I am, how do you say, afraid I cannot"
  → Self-conscious, learned-phrase feeling

SCENARIO: Starting conversation

FORCED responses:
- "I am going to break the ice now. Hello everyone!"
  → Announcing the action - natives just DO it
  
- "Let me try to break the ice by asking..."
  → "Let me try to" = metacommentary on language use
```

---

### TIER 1: INCORRECT (0-30% - Wrong meaning or grammar)

**Definition:** Phrase is used with wrong meaning, wrong grammar, or completely inappropriate context

**Recognition markers:**

- ❌ Meaning is wrong
- ❌ Grammar is wrong
- ❌ Completely inappropriate for context
- ❌ Creates confusion or offense

**Examples:**

```other
SCENARIO: Discussing apartment price

INCORRECT responses:
- "The apartment is dirty cheap"
  → Wrong form - "dirty" not "dirt"
  
- "I will dirt cheap find it"
  → Wrong word order/grammar
  
- "This is cheap dirt"
  → Words reversed, different meaning

SCENARIO: Formal business email

INCORRECT responses:
- "The solution is dirt cheap" (to CEO)
  → Too casual for business formal context
  
- "We gonna break ice at meeting"
  → Grammar errors + inappropriate register

SCENARIO: Breaking the ice

INCORRECT responses:
- "I broke the ice in the room"
  → Implies physical ice, wrong meaning
  
- "Let me ice break now"
  → Wrong word order, ungrammatical
```

---

## Special Case: NOT_USED

**Definition:** Phrase doesn't appear in response at all

**Recognition:**

- Phrase not present in any form
- No valid variations or conjugations
- User used different vocabulary

**Not penalized - just marked as "not detected"**

---

## Variation Handling Rules

### VALID variations (count as detected):

```other
ROOT PHRASE: "break the ice"

✅ VALID:
- "broke the ice" (past tense)
- "breaking the ice" (gerund)
- "breaks the ice" (third person)
- "ice breaker" (related form)
- "ice-breaking activity" (compound form)

❌ INVALID:
- "break ice" (missing article)
- "ice breaking" (wrong form)
- "make ice break" (wrong construction)
```

```other
ROOT PHRASE: "dirt cheap"

✅ VALID:
- "dirt cheap" (exact)
- "dirt-cheap" (hyphenated variant)

❌ INVALID:
- "dirty cheap" (wrong adjective)
- "cheap dirt" (reversed)
- "very cheap" (different phrase)
```

```other
ROOT PHRASE: "I'm afraid I can't"

✅ VALID:
- "I'm afraid I can't"
- "I am afraid I cannot"
- "I'm afraid I won't be able to"
- "I'm afraid that's not possible"

❌ INVALID:
- "I'm scared I can't" (wrong emotion)
- "I fear I cannot" (archaic/different phrase)
```

---

## Context-Specific Naturalness

**Same phrase, different naturalness based on context:**

### Example: "cheap"

```other
CONTEXT 1: Friends texting about shopping
Response: "That's so cheap!"
Assessment: NATURAL ✅
Reason: Casual, enthusiastic, perfect for friends

CONTEXT 2: Business presentation to executives  
Response: "This solution is cheap"
Assessment: FORCED ⚠️
Reason: Too casual - should use "cost-effective" or "economical"

CONTEXT 3: Product review online
Response: "The product is cheap but good quality"
Assessment: ACCEPTABLE ⚠️
Reason: "Cheap" implies low quality - better: "inexpensive" or "affordable"
```

### Example: "I'm afraid I can't"

```other
CONTEXT 1: Boss asking to work Saturday
Response: "I'm afraid I can't - I have family plans"
Assessment: NATURAL ✅
Reason: Polite, professional, maintains relationship

CONTEXT 2: Close friend asking to hang out
Response: "I'm afraid I can't make it tonight"
Assessment: ACCEPTABLE ⚠️
Reason: Too formal for close friend - better: "Can't make it tonight, sorry!"

CONTEXT 3: Formal legal response
Response: "I'm afraid I cannot attend the hearing"
Assessment: FORCED ⚠️
Reason: Too casual for legal - better: "I am unable to attend" or "I respectfully decline"
```

---

## Scoring Formula

```javascript
function calculateNaturalnessScore(assessment) {
  const tierScores = {
    NATURAL: 100,
    ACCEPTABLE: 80,
    FORCED: 50,
    INCORRECT: 20,
    NOT_USED: 0
  };
  
  let baseScore = tierScores[assessment.tier];
  
  // Adjust for context appropriateness
  if (assessment.pragmaticMismatch) {
    baseScore -= 20;  // Wrong register/relationship
  }
  
  // Adjust for grammar (minor impact if natural)
  if (assessment.grammarErrors && assessment.tier === 'NATURAL') {
    baseScore -= 5;  // Natural but minor errors = still high score
  }
  
  // Adjust for emotional tone match
  if (assessment.toneMismatch) {
    baseScore -= 15;  // Wrong emotion/attitude
  }
  
  return Math.max(0, Math.min(100, baseScore));
}
```

---

# <a name="question-algorithm"></a>QUESTION TYPE SELECTION ALGORITHM

## Algorithm Overview

```javascript
const QUESTION_TYPE_PROGRESSION = {
  // Review 1-2: RECOGNITION PHASE
  "review_1-2": {
    phase: "recognition",
    cognitiveLoad: "low",
    duration: "3-5 minutes",
    questionCount: 5,
    
    allowedTypes: [
      {
        type: "social_consequence_prediction",
        weight: 0.4,  // 40% of questions
        minCount: 2,
        maxCount: 3
      },
      {
        type: "situation_phrase_matching",
        weight: 0.3,
        minCount: 1,
        maxCount: 2
      },
      {
        type: "tone_interpretation",
        weight: 0.2,
        minCount: 1,
        maxCount: 1
      },
      {
        type: "contrast_exposure",
        weight: 0.1,
        minCount: 0,
        maxCount: 1
      }
    ],
    
    avoidTypes: [
      "production", "transformation", "explain_to_friend", 
      "error_detection", "why_did_they_say"
    ]
  },
  
  // Review 3-4: COMPREHENSION PHASE
  "review_3-4": {
    phase: "comprehension",
    cognitiveLoad: "medium",
    duration: "5-7 minutes",
    questionCount: 6,
    
    allowedTypes: [
      {
        type: "why_did_they_say",
        weight: 0.3,
        minCount: 2,
        maxCount: 2
      },
      {
        type: "appropriateness_judgment",
        weight: 0.3,
        minCount: 2,
        maxCount: 2
      },
      {
        type: "error_detection",
        weight: 0.2,
        minCount: 1,
        maxCount: 1
      },
      {
        type: "fill_gap_mcq",
        weight: 0.1,
        minCount: 1,
        maxCount: 1
      },
      {
        type: "register_sorting",
        weight: 0.1,
        minCount: 0,
        maxCount: 1
      }
    ],
    
    avoidTypes: [
      "open_production", "scenario_production",
      "explain_to_friend", "creative_use"
    ]
  },
  
  // Review 5-6: GUIDED PRODUCTION PHASE
  "review_5-6": {
    phase: "guided_production",
    cognitiveLoad: "medium-high",
    duration: "6-8 minutes",
    questionCount: 6,
    
    allowedTypes: [
      {
        type: "constrained_production",
        weight: 0.35,
        minCount: 2,
        maxCount: 3
      },
      {
        type: "transformation_exercise",
        weight: 0.25,
        minCount: 1,
        maxCount: 2
      },
      {
        type: "dialogue_completion_open",
        weight: 0.25,
        minCount: 1,
        maxCount: 2
      },
      {
        type: "register_sorting",
        weight: 0.15,  // Warm-up
        minCount: 1,
        maxCount: 1
      }
    ],
    
    avoidTypes: [
      "social_consequence_prediction", "tone_interpretation"
    ]
  },
  
  // Review 7+: FREE PRODUCTION / MASTERY
  "review_7+": {
    phase: "mastery",
    cognitiveLoad: "high",
    duration: "7-10 minutes",
    questionCount: 6,
    
    allowedTypes: [
      {
        type: "scenario_production",
        weight: 0.35,
        minCount: 2,
        maxCount: 3
      },
      {
        type: "multiple_response_generation",
        weight: 0.25,
        minCount: 1,
        maxCount: 2
      },
      {
        type: "explain_to_friend",
        weight: 0.2,
        minCount: 1,
        maxCount: 1
      },
      {
        type: "creative_context_use",
        weight: 0.1,
        minCount: 0,
        maxCount: 1
      },
      {
        type: "fill_gap_mcq",
        weight: 0.1,  // Warm-up
        minCount: 1,
        maxCount: 1
      }
    ],
    
    avoidTypes: []  // All types allowed at mastery
  }
};
```

## Selection Algorithm Implementation

```javascript
function selectQuestions(phrase, reviewNumber, targetDuration = 360) {
  // Determine phase
  const phase = getPhase(reviewNumber);
  const config = QUESTION_TYPE_PROGRESSION[phase];
  
  // Initialize selection
  const selectedQuestions = [];
  const remainingTypes = [...config.allowedTypes];
  
  // Step 1: Ensure minimum required questions
  for (const typeConfig of config.allowedTypes) {
    for (let i = 0; i < typeConfig.minCount; i++) {
      selectedQuestions.push({
        type: typeConfig.type,
        phrase: phrase,
        priority: 'required'
      });
    }
  }
  
  // Step 2: Fill remaining slots weighted by importance
  while (selectedQuestions.length < config.questionCount) {
    const type = weightedRandom(remainingTypes);
    
    // Check max count
    const currentCount = selectedQuestions.filter(q => q.type === type.type).length;
    if (currentCount < type.maxCount) {
      selectedQuestions.push({
        type: type.type,
        phrase: phrase,
        priority: 'weighted'
      });
    }
  }
  
  // Step 3: Estimate duration and adjust
  const estimatedDuration = calculateDuration(selectedQuestions);
  
  if (estimatedDuration > targetDuration) {
    // Remove lowest priority questions
    selectedQuestions.sort((a, b) => 
      (a.priority === 'required' ? 0 : 1) - (b.priority === 'required' ? 0 : 1)
    );
    while (calculateDuration(selectedQuestions) > targetDuration) {
      selectedQuestions.pop();
    }
  }
  
  return selectedQuestions;
}

function getPhase(reviewNumber) {
  if (reviewNumber <= 2) return "review_1-2";
  if (reviewNumber <= 4) return "review_3-4";
  if (reviewNumber <= 6) return "review_5-6";
  return "review_7+";
}

function weightedRandom(types) {
  const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const type of types) {
    if (random < type.weight) return type;
    random -= type.weight;
  }
  
  return types[types.length - 1];
}

const DURATION_ESTIMATES = {
  social_consequence_prediction: 30,
  situation_phrase_matching: 40,
  tone_interpretation: 25,
  contrast_exposure: 30,
  fill_gap_mcq: 25,
  register_sorting: 45,
  appropriateness_judgment: 40,
  dialogue_reordering: 50,
  error_detection: 35,
  why_did_they_say: 40,
  constrained_production: 60,
  transformation_exercise: 50,
  dialogue_completion_open: 70,
  multiple_response_generation: 90,
  scenario_production: 120,
  explain_to_friend: 90,
  creative_context_use: 60
};

function calculateDuration(questions) {
  return questions.reduce((total, q) => 
    total + (DURATION_ESTIMATES[q.type] || 45), 0
  );
}
```

## Example Usage

```javascript
// User is on review #3 for "cheap"
const questions = selectQuestions("cheap", 3);

/* Returns:
[
  { type: "why_did_they_say", phrase: "cheap", priority: "required" },
  { type: "why_did_they_say", phrase: "cheap", priority: "required" },
  { type: "appropriateness_judgment", phrase: "cheap", priority: "required" },
  { type: "appropriateness_judgment", phrase: "cheap", priority: "required" },
  { type: "error_detection", phrase: "cheap", priority: "required" },
  { type: "fill_gap_mcq", phrase: "cheap", priority: "weighted" }
]

Estimated duration: ~245 seconds (4 minutes)
*/
```

---

# <a name="category-1"></a>CATEGORY 1: CONTENT GENERATION

## 1.1 Listening Session Script

**File:** `api/listening-session/generate/route.ts`

**AI Model:** DeepSeek

**Purpose:** Generate natural dialogue for listening comprehension

### System Prompt

```other
You are a dialogue writer creating authentic conversations that teach vocabulary through immersion, not explanation.
```

### User Prompt

```javascript
`You are writing a REALISTIC conversation where people naturally use these phrases:

${phraseList}

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
  "script": "Full dialogue with speaker labels",
  "audioNotes": "Where words blend, emphasis points",
  "questions": [
    {
      "question": "Story-based question text",
      "options": ["A", "B", "C", "D"],
      "correct": 1,
      "targetPhrase": "Which phrase this tests",
      "rationale": "Why this tests understanding"
    }
  ]
}`
```

### Example Output

```json
{
  "script": "SARAH: [sighs] I've been looking for three months. Everything is either a dump or way over budget.\n\nMIKE: Ugh, I know that feeling. Have you tried--\n\nSARAH: --Wait! [excited] Mike! Look at this listing. Downtown, one bedroom, $700.\n\nMIKE: [skeptical] $700? In that neighborhood? No way. That's gotta be a scam.\n\nSARAH: I know, right? I'm thinking the same thing, but... what if it's real?\n\nMIKE: I mean, that's dirt cheap for that area. Like, suspiciously cheap. What's the catch?\n\nSARAH: That's what I need to find out. I'm gonna call them right now.\n\nMIKE: Okay, but be careful. If something sounds too good to be true...\n\nSARAH: I know, I know. But honestly, at this point, I'm desperate enough to check it out.",
  
  "audioNotes": "Line 3: 'Have you tried--' interrupted. Line 5: 'gotta be' = 'got to be' (contraction). Line 7: 'dirt cheap' - emphasize 'DIRT'. Line 9: 'gonna' = 'going to'",
  
  "questions": [
    {
      "question": "Why does Mike say the apartment is 'dirt cheap'?",
      "options": [
        "He thinks it's dirty and cheap",
        "The price is surprisingly low for that area",
        "He's criticizing Sarah's choice",
        "$700 is expensive for him"
      ],
      "correct": 1,
      "targetPhrase": "dirt cheap",
      "rationale": "Understanding 'dirt cheap' = surprisingly inexpensive is needed to answer correctly"
    },
    {
      "question": "How does Sarah feel when she sees the $700 listing?",
      "options": [
        "Skeptical and worried",
        "Confused and unsure",
        "Excited but cautious",
        "Disappointed"
      ],
      "correct": 2,
      "targetPhrase": "dirt cheap (implied excitement)",
      "rationale": "Her excitement ('Wait! Mike!') combined with caution shows she understands it's unusually cheap"
    },
    {
      "question": "What happens after Mike says 'dirt cheap'?",
      "options": [
        "Sarah changes her mind about the apartment",
        "Mike encourages Sarah to rent it immediately",
        "Mike warns Sarah to be careful because the price seems suspicious",
        "Sarah agrees it's too cheap to be good"
      ],
      "correct": 2,
      "targetPhrase": "dirt cheap",
      "rationale": "Mike's reaction ('suspiciously cheap', 'what's the catch') shows he's warning her"
    },
    {
      "question": "Why does Mike interrupt Sarah in the beginning?",
      "options": [
        "He's offering to help her search",
        "He disagrees with her approach",
        "He wants to change the subject",
        "He's being rude"
      ],
      "correct": 0,
      "targetPhrase": "Context for dialogue naturalness",
      "rationale": "Tests understanding of conversational flow - interruption shows engagement"
    },
    {
      "question": "What does Sarah mean by 'I'm desperate enough to check it out'?",
      "options": [
        "She's given up on finding a good apartment",
        "She'll take any risk because she needs housing badly",
        "She thinks it's definitely a scam",
        "She doesn't trust Mike's advice"
      ],
      "correct": 1,
      "targetPhrase": "General comprehension",
      "rationale": "Tests overall dialogue understanding and emotional stakes"
    }
  ]
}
```

---

## 1.2 Reading Session Passage

**File:** `api/reading-session/generate/route.ts`

**AI Model:** DeepSeek

**Purpose:** Generate reading passages with natural vocabulary integration

### System Prompt

```other
You are a master storyteller who teaches vocabulary through immersive narratives, never through definitions.
```

### User Prompt

```javascript
`Create an engaging passage that naturally incorporates these phrases:

${phraseList}

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

5. **VARIED CONTEXTS**
   - If you have similar phrases (cheap/affordable/economical): Show them in DIFFERENT social contexts
   - Let the context demonstrate the difference without stating it

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

**Type 4: Pragmatic Appropriateness (1 question)**
Test: Situation determines phrase choice

Example: "When Sarah texts her friend 'dirt cheap,' it shows she's:"
A) Being professional
B) Warning about quality
C) Feeling excited and informal ✓
D) Asking for advice

ANSWER CONSTRUCTION:
- Correct answer = requires understanding TARGET PHRASE in context
- Wrong answers = plausible if you DON'T understand the phrase
- Include one answer that would be right if phrase meant something else

Return JSON with passage + questions.`
```

### Example Output

```json
{
  "passage": "Sarah had been searching for three months. Every apartment was either a dump or way over budget. The city had become impossible—even studio apartments in sketchy neighborhoods were going for $1,200. Her savings were dwindling, and her temporary Airbnb would end in two weeks.\n\nThen she saw it: a one-bedroom downtown for $700.\n\nShe clicked the listing immediately. The photos looked... normal? Clean floors, natural light, nothing screaming \"scam.\" She texted Mike: \"Found a place. Dirt cheap!\"\n\nMike's reply came instantly: \"No way. That area's usually $1500+. What's the catch?\"\n\nGood question. Sarah scrolled through the description. No mention of broken appliances, no weird requirements. The landlord's message was professional. She decided to schedule a viewing.\n\nThe next day, Sarah stood outside the building. It looked fine—not luxury, but definitely not falling apart. The landlord, a middle-aged woman named Carol, greeted her warmly.\n\n\"I know the price seems unusual,\" Carol said, reading Sarah's expression. \"My daughter just moved out for college. I'd rather rent it to someone reliable than deal with corporate property management. Call it economical for both of us.\"\n\nSarah toured the apartment. Small but clean. Good water pressure. Working appliances. She couldn't believe her luck.\n\n\"I'll take it,\" Sarah said.\n\nCarol smiled. \"Great. I'll email the lease today.\"\n\nThat evening, Sarah called her mom. \"I found a place. Really affordable—$700 for downtown.\"\n\n\"That's wonderful, honey! Is it safe?\"\n\n\"Yeah, I checked everything. The landlord just wants someone reliable instead of going through agencies. It's a good deal, not a scam.\"\n\nHer mom laughed. \"Well, don't tell your father the exact price. He'll think you're lying.\"",
  
  "questions": [
    {
      "question": "Why did Mike respond with 'No way' to Sarah's text?",
      "options": [
        "He didn't believe Sarah found an apartment",
        "He was surprised the price was so low for that area",
        "He thought Sarah was joking about the price",
        "He was angry that Sarah didn't tell him sooner"
      ],
      "correct": 1,
      "targetPhrase": "dirt cheap",
      "rationale": "Mike's surprise ('That area's usually $1500+') shows he understands 'dirt cheap' means surprisingly low price"
    },
    {
      "question": "Why did Carol use the word 'economical' when explaining the price?",
      "options": [
        "She wanted to sound more educated",
        "She was being professional while explaining her reasoning",
        "'Economical' means something different from 'affordable'",
        "She forgot the word 'cheap'"
      ],
      "correct": 1,
      "targetPhrase": "economical",
      "rationale": "Carol's professional tone matches 'economical' - more formal than 'cheap'"
    },
    {
      "question": "How does Sarah feel when she texts Mike 'dirt cheap'?",
      "options": [
        "Worried and suspicious",
        "Excited and surprised",
        "Confused and uncertain",
        "Disappointed with the price"
      ],
      "correct": 1,
      "targetPhrase": "dirt cheap",
      "rationale": "The exclamation mark and immediate texting show excitement"
    },
    {
      "question": "Why does Sarah tell her mom it's 'affordable' instead of 'dirt cheap'?",
      "options": [
        "She forgot the exact price",
        "She's being more formal/neutral with her parent",
        "Her mom wouldn't understand slang",
        "'Affordable' means something different"
      ],
      "correct": 1,
      "targetPhrase": "affordable vs dirt cheap (pragmatic choice)",
      "rationale": "Shows implicit understanding of register - casual with friend, neutral with mom"
    },
    {
      "question": "What's Sarah's main concern when she sees the $700 listing?",
      "options": [
        "Whether it's too small",
        "Whether it's a scam because the price is suspiciously low",
        "Whether her mom will approve",
        "Whether Mike will be jealous"
      ],
      "correct": 1,
      "targetPhrase": "Context (cheap = suspicious)",
      "rationale": "Her thoughts about 'scam' and 'catch' show she knows very cheap can be suspicious"
    }
  ]
}
```

---

# <a name="category-2"></a>CATEGORY 2: ROLEPLAY/SCENARIO

## 2.1 Start Scenario

**File:** `api/user/start-scenario/route.ts`

**AI Model:** DeepSeek

**Purpose:** Create roleplay scenarios with natural stakes

### System Prompt

```other
You are a roleplay designer creating authentic situations where language learning happens through doing, not studying.
```

### User Prompt

```javascript
`Create a roleplay scenario that naturally elicits these phrases:

${phraseList}

CONTEXT REQUIREMENTS:
- Setting: ${clusterContext.context}
- Relationship: ${clusterContext.pragmatics.relationship}
- Register: ${clusterContext.pragmatics.register}

SCENARIO DESIGN PRINCIPLES:

1. **GIVE THEM A GOAL** (Not just "have a conversation")
   ❌ BAD: "You're texting a friend"
   ✅ GOOD: "Your friend is stressed about finding housing. Cheer them up by sharing a great deal you found."
   
   The goal creates natural reason to use target phrases.

2. **CREATE NATURAL SETUP** (Situation → Phrases emerge organically)
   
   If target phrase is "dirt cheap":
   - Setup: User just found amazing deal, friend is struggling with expensive options
   - Natural emergence: Excitement leads to "This is dirt cheap!"
   
   If target phrase is "I'm afraid I can't":
   - Setup: Boss asks to work Saturday, user has family commitment
   - Natural emergence: Polite refusal needed

3. **EMBED SOCIAL STAKES** (Why does language choice matter?)
   - With boss: Professional tone maintains relationship
   - With friend: Casual tone shows closeness
   - With stranger: Polite distance appropriate
   
   Wrong register = awkwardness (which you'll show in character reaction)

4. **CONTEXTUAL RICHNESS** (2-3 sentences max)
   Provide:
   - WHO you're talking to (relationship clear)
   - WHAT just happened (creates need for target phrases)
   - WHAT you need to do (user's goal)

EXAMPLE OUTPUT:

{
  "scenario": "Your friend Sarah has been apartment hunting for 2 months and everything is over $1500/month. You just found a place for $700 in the same neighborhood. She texts: 'Still no luck. This city is impossible 😩' Cheer her up with your good news.",
  
  "userGoal": "Share your find with enthusiasm (use casual, excited language)",
  
  "characterPersonality": "Sarah is stressed but hopeful. She'll be genuinely excited by good news, but skeptical of deals that sound too good.",
  
  "targetPhrases": ["dirt cheap", "affordable"],
  
  "firstMessage": "Still no luck. This city is impossible 😩"
}

AVOID:
- "Practice using X phrase" (never mention phrase explicitly)
- Overly complex situations (no dramatic conflicts)
- Vague scenarios ("talk about shopping" - too broad)

INCLUDE:
- Clear emotional context (stress, excitement, concern)
- Reason to use specific register
- Natural conversation flow possibility`
```

### Example Outputs

**Example 1: Casual friend context**

```json
{
  "scenario": "Your friend Alex has been trying to save money for a vacation but keeps complaining that everything is too expensive. You just discovered a flight deal - $89 roundtrip to Miami (usually $400+). Alex texts: 'Ugh, I'll never save enough at this rate. Everything costs so much 💸'",
  
  "userGoal": "Share the flight deal with excitement and encourage Alex to book it",
  
  "characterPersonality": "Alex is budget-conscious but pessimistic about finding good deals. Needs encouragement to take action. Gets excited when genuinely good opportunities appear.",
  
  "targetPhrases": ["dirt cheap", "affordable", "great deal"],
  
  "firstMessage": "Ugh, I'll never save enough at this rate. Everything costs so much 💸"
}
```

**Example 2: Professional context**

```json
{
  "scenario": "Your manager emails asking if you can attend a client meeting this Saturday at 9 AM. You have your sister's wedding that day (out of state). You need to decline professionally while maintaining the relationship.",
  
  "userGoal": "Politely refuse the Saturday meeting without seeming uncooperative",
  
  "characterPersonality": "Your manager is understanding but values professionalism. Appreciates clear communication and advance notice.",
  
  "targetPhrases": ["I'm afraid I can't", "unfortunately", "prior commitment"],
  
  "firstMessage": "Hi - Quick question: Could you join the Miller client meeting this Saturday at 9 AM? Would really help to have your input."
}
```

---

## 2.2 Scenario Turn (Conversation)

**File:** `api/user/scenario-turn/route.ts`

**AI Model:** DeepSeek

**Purpose:** Evaluate and respond to user's roleplay turns

### System Prompt

```other
You are both a conversation partner AND a naturalness judge. Your responses must feel authentic while subtly evaluating language quality.
```

### User Prompt

```javascript
`ROLEPLAY CONTEXT:
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
   
   B) **NATURALNESS ASSESSMENT** (This is NEW and CRITICAL)
   
   NOT USED: Phrase didn't appear
   
   FORCED: ❌ Phrase appears but sounds unnatural
   - Example: "I want to break the ice now with you" (announcing it)
   - Example: "This apartment is, how do you say, dirt cheap" (self-conscious)
   - Example: Phrase appears in grammatically correct but awkward position
   
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

CRITICAL RULES:
- If user uses FORCED phrase: Respond naturally but status = "forced" (doesn't count)
- If user uses wrong register: Your character reaction should reflect the awkwardness
- Never break character to give language tips - that happens in analysis only`
```

### Example Interaction

**Scenario:** Friend asking about apartment deal

**User message:** "Yeah I found a place! Is very much cheap, only $700!"

**AI Response:**

```json
{
  "evaluation": [
    {
      "phrase": "cheap",
      "status": "forced",
      "reasoning": "'Very much cheap' is unnatural phrasing - natives would say 'really cheap' or 'so cheap'. Phrase appears but awkwardly."
    }
  ],
  
  "analysis": {
    "issues": [
      {
        "text": "Is very much cheap",
        "why": "English speakers don't say 'very much cheap' - this sounds translated from another language",
        "better": ["It's really cheap", "It's so cheap", "Super cheap"]
      }
    ],
    "praise": "Good excitement! You're clearly enthusiastic about the find."
  },
  
  "response": "Wait, $700?! That's amazing! 😍 Is it in a good area? Sometimes super cheap places are in sketchy neighborhoods..."
}
```

**Next turn - User:** "Yes! It's dirt cheap for downtown!"

**AI Response:**

```json
{
  "evaluation": [
    {
      "phrase": "dirt cheap",
      "status": "natural",
      "reasoning": "Perfect! 'It's dirt cheap' with enthusiasm is exactly how friends share exciting news. Natural contraction, good emphasis."
    }
  ],
  
  "analysis": {
    "issues": [],
    "praise": "Perfect natural usage! 'Dirt cheap' sounded genuinely enthusiastic."
  },
  
  "response": "OMG downtown?! That IS dirt cheap! That area's usually like $1500+! 😱 When can you move in??"
}
```

---

## 2.3 End Scenario (Summary)

**File:** `api/user/end-scenario/route.ts`

**AI Model:** DeepSeek

**Purpose:** Provide encouraging feedback after roleplay

### System Prompt

```other
You are a language coach providing warm, specific feedback that focuses on natural communication over perfect grammar.
```

### User Prompt

```javascript
`Analyze this roleplay conversation and provide encouraging but specific feedback.

SCENARIO: ${scenario}
USER'S GOAL: ${goal}

CONVERSATION:
${conversationHistory}

ANALYSIS FRAMEWORK:

1. **COMMUNICATION SUCCESS** (Did they achieve the goal?)
   - Not: Did they use perfect grammar?
   - But: Did they communicate effectively for this relationship/context?

2. **NATURALNESS WINS** (Highlights)
   - Which moments sounded genuinely native-like?
   - Where did they match the register perfectly?
   - Any surprisingly natural phrases or flow?

3. **ONE GROWTH EDGE** (Not "mistakes" - GROWTH)
   Focus on ONE of:
   - Pragmatic adjustment: "With friends, try X instead of Y for more natural flow"
   - Register matching: "Great enthusiasm! For colleagues, consider toning down to..."
   - Conversation flow: "You could keep momentum by adding follow-up like..."

RESPONSE FORMAT (JSON):

{
  "userStrengths": "One specific thing they did well - be concrete. Example: 'Your use of 'dirt cheap' with your friend showed perfect casual enthusiasm'",
  
  "userTip": "ONE actionable tip for next time. Not generic 'be more natural' but specific like: 'When sharing good news with friends, adding emojis or 'OMG!' makes excitement clearer in text'",
  
  "overallScore": "Warm 3-4 word encouragement like: 'Natural and friendly!' or 'Great conversation flow!'"
}

TONE: Encouraging coach, not critical teacher
FOCUS: What worked + one specific growth edge
AVOID: Grammar lectures, multiple criticisms, vague praise`
```

### Example Output

```json
{
  "userStrengths": "Your use of 'dirt cheap' when sharing the apartment deal was perfectly natural - the excitement came through clearly and matched how friends actually text each other!",
  
  "userTip": "When your friend asked about safety, you could have kept the conversational flow going by adding something like 'Yeah, I checked! The neighborhood's actually really nice' - this shows you're thinking ahead about their concerns.",
  
  "overallScore": "Natural and enthusiastic! 🎉"
}
```

---

# <a name="category-3"></a>CATEGORY 3: SPEAKING/ANALYSIS

## 3.1 Speaking Analysis

**File:** `lib/speaking-analysis.ts`

**AI Model:** Gemini

**Purpose:** Analyze spoken responses for naturalness

### System Prompt

```other
You are a pronunciation coach who evaluates spoken English for naturalness, not just correctness. Your goal is to help learners sound genuinely native, not just grammatically accurate.
```

### User Prompt

```javascript
`SPEAKING EVALUATION CONTEXT:

Question asked: "${questionText}"
Situation: ${questionContext}
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
   
   NOT USED: Didn't appear in transcription
   
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

3. **INTONATION ANALYSIS** (NEW - CRITICAL FOR NATURALNESS)
   
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
      {"word": "That's", "actual": 0.4, "expected": 0.3-0.5, "assessment": "good"},
      {"word": "dirt", "actual": 0.6, "expected": 0.8-1.0, "assessment": "needs more emphasis"},
      {"word": "cheap", "actual": 0.5, "expected": 0.5-0.7, "assessment": "good"}
    ],
    "keyMoments": ["'dirt' in 'dirt cheap' should be emphasized for excitement - try stressing it more"],
    "overallPattern": "Generally good rhythm, but could add more emotion through pitch variation"
  },
  
  "pragmaticFit": {
    "score": 8,
    "reasoning": "Good casual tone for friend context. Phrase choice appropriate.",
    "issues": null OR "specific issue"
  },
  
  "fluency": "natural|hesitant|choppy",
  
  "suggestions": [
    "Emphasize 'DIRT' more in 'dirt cheap' for natural excitement",
    "Great casual tone! You sounded genuinely enthusiastic",
    "Your natural pauses ('um', 'like') are actually good - natives do this"
  ],
  
  "encouragement": "You sounded genuinely excited sharing that news! The phrase fit perfectly for casual friend conversation."
}

CRITICAL: Prioritize NATURAL over CORRECT. 
A grammatically perfect but stiff response scores LOWER than a natural response with minor errors.`
```

---

## 3.2 Phrase Detection

**File:** `lib/phrase-detection.ts`

**AI Model:** Gemini

**Purpose:** Detect if phrases are used naturally

### System Prompt

```other
You are a native English speaker checking if someone used phrases NATURALLY.
```

### User Prompt

```javascript
`You are a native English speaker checking if someone used phrases NATURALLY (not just correctly).

TARGET PHRASES:
${phraseList}

USER'S RESPONSE:
"${userResponse}"

TASK: For each phrase, determine if they used it NATURALLY (not just correctly).

SCORING GUIDE:

- NATURAL: Perfect usage. You'd say it exactly this way.
  Example: "That's dirt cheap!" (excitement, natural flow)
  
- ACCEPTABLE: Correct but slightly stiff/textbook-ish
  Example: "It is very cheap" (should be "It's so cheap!")
  
- FORCED: Grammatically crammed in, doesn't flow
  Example: "I want to break the ice now" (announcing phrase)
  
- INCORRECT: Wrong meaning, grammar, or context
  Example: "The apartment is dirty cheap" (wrong word)
  
- NOT_USED: Phrase not present

ADDITIONAL SCORING EXAMPLES:

FORCED (Grammar correct but unnatural):
- User: "I want to break the ice now" 
  → Too self-conscious, natives just DO it
  
- User: "This is what you call dirt cheap"
  → Over-explaining, sounds like textbook

- User: "I am afraid I cannot attend the meeting"
  → Too formal/stiff for email to friend

ACCEPTABLE (Correct but could be more natural):
- User: "I am going to break the ice"
  → Grammatically fine, but "I'll break the ice" more natural

- User: "It is very cheap"
  → Correct, but "It's so cheap!" more natural

NATURAL (How natives actually say it):
- User: "Let me break the ice - where are you from?"
  → Perfect usage, natural flow

- User: "That's dirt cheap!"
  → Exactly how you'd say it

CRITICAL RULE:
Only "NATURAL" and "ACCEPTABLE" count as successful detection.
"FORCED" = detected but FAILED (because we care about natural usage).

Rules:
- "NATURAL/ACCEPTABLE" = detected successfully
- "FORCED" = detected but doesn't count as good usage
- Be strict on naturalness - grammar isn't enough

Return JSON for each phrase.`
```

---

# <a name="category-4"></a>CATEGORY 4: EVALUATION/SCORING

## 4.1 Evaluate Production

**File:** `api/user/evaluate-production/route.ts`

**AI Model:** DeepSeek

**Purpose:** Evaluate written responses for naturalness

### System Prompt

```other
You are a naturalness judge for language learners. Grammar accuracy matters less than whether they sound like real people.
```

### User Prompt

```javascript
`Evaluate this user's response for NATURAL usage of target phrases.

TARGET PHRASES: ${phraseList}
SCENARIO: ${scenario}
SAMPLE NATIVE RESPONSE: ${sampleResponse}
USER'S ANSWER: "${userAnswer}"

EVALUATION FRAMEWORK:

1. **PHRASE-BY-PHRASE ANALYSIS**

For each target phrase, assess:

A) **PRESENCE**
- Did the phrase appear (exact or valid variation)?
- Valid variations: tense changes, pronoun changes
- Example: "broke the ice" = valid for "break the ice"

B) **MEANING CORRECTNESS**
- Is the core meaning right for this context?
- Don't penalize if they meant the same thing with different words
- Example: "very cheap" = similar meaning to "dirt cheap" (not wrong, just different choice)

C) **NATURALNESS** (MOST IMPORTANT)

UNNATURAL (0 points):
- Phrase is grammatically inserted but doesn't flow
- Example: "I want to say that this is dirt cheap"
- Example: "The apartment, which is dirt cheap, is available"
- Sounds like they're trying to use a phrase, not naturally speaking

ACCEPTABLE (1 point):
- Phrase is used correctly but sounds slightly textbook-ish
- Example: "It is very cheap" (vs native "It's so cheap!")
- Example: "I am afraid I cannot" (vs native "I'm afraid I can't")
- Grammatically fine, just a bit stiff

NATURAL (2 points):
- This is EXACTLY how a native speaker would say it
- Perfect flow, perfect context, perfect register
- Example: "OMG that's dirt cheap!" (enthusiasm + casual = perfect)

D) **PRAGMATIC APPROPRIATENESS**

Check:
- **Register match**: Casual phrase in casual scenario? Formal in formal?
- **Relationship match**: Would you say this to this person?
- **Tone match**: Does emotion/attitude fit?

Pragmatic issues:
- Using "dirt cheap" in business email to boss (too casual)
- Using "I am unable to" to close friend (too formal)
- Using "economical" when excited to friend (wrong tone)

2. **OVERALL PRAGMATIC SCORE** (1-5)

5 = Perfect: All phrases fit scenario's register, relationship, and tone
4 = Good: Minor pragmatic mismatch (e.g., slightly too formal)
3 = Acceptable: Understandable but noticeable pragmatic issues
2 = Awkward: Multiple mismatches (wrong register + wrong tone)
1 = Inappropriate: Seriously wrong for context

3. **HOLISTIC ASSESSMENT**

Compare to sample native response:
- User's version might use different words but achieve same effect = GOOD
- User's version sounds translated or textbook-like = NEEDS WORK
- User's version sounds robot-like despite correct grammar = ISSUE

RESPONSE FORMAT (JSON):

{
  "phraseResults": [
    {
      "phrase": "dirt cheap",
      "present": true,
      "meaningCorrect": true,
      "naturalness": {
        "score": 2,  // 0=unnatural, 1=acceptable, 2=natural
        "assessment": "natural|acceptable|unnatural",
        "reasoning": "Used in 'That's dirt cheap!' - perfect casual enthusiasm"
      },
      "pragmaticFit": {
        "appropriate": true,
        "issue": null OR "Too formal for friend context"
      },
      "feedback": "Perfect! Natural excitement with friend."
    }
  ],
  
  "pragmaticFeedback": {
    "score": 5,  // 1-5
    "overallAssessment": "All phrases fit the casual friend scenario perfectly",
    "issue": null OR "specific pragmatic mismatch",
    "suggestion": null OR "specific improvement"
  },
  
  "overallScore": 85,  // 0-100
  
  "overallFeedback": "Natural and appropriate! Your use of 'dirt cheap' sounded genuinely enthusiastic for sharing news with a friend. Consider: natives might also add emojis or 'OMG!' to amplify excitement in texts."
}

CRITICAL RULES:
- Naturalness > Grammar: "It's so cheap!" with minor error beats "It is very economical" perfectly
- Pragmatics matter: Right phrase in wrong context = lower score
- Compare to natives: Would a native speaker say it EXACTLY this way?
- Be encouraging: Highlight what worked, gentle on what didn't`
```

---

# <a name="category-5"></a>CATEGORY 5: MEANING/EXPLANATION

## 5.1 Generate Meaning

**File:** `api/generate-meaning/route.ts`

**AI Model:** DeepSeek

**Purpose:** Create memorable phrase explanations

### System Prompt

```other
You are a vocabulary specialist who makes phrases unforgettable through vivid scenarios and emotional connections, never through dictionary definitions.
```

### User Prompt

```javascript
`Help a learner remember this phrase FOREVER through experience, not definition:

PHRASE: "${phrase}"
ENCOUNTERED IN: "${context}"

YOUR TEACHING FRAMEWORK:

1. **CORE ESSENCE** (1 sentence - NO dictionary speak)
   
   ❌ BAD: "A colloquial expression meaning inexpensive"
   ✅ GOOD: "When something costs WAY less than you expected - surprising cheapness"
   
   Capture the FEELING, not just the meaning.

2. **MEMORY ANCHOR** (Vivid, specific scenario)
   
   Create ONE scenario that:
   - Is emotionally resonant (surprise, excitement, relief)
   - Is ultra-specific (not generic)
   - Makes the phrase INEVITABLE
   
   Example for "dirt cheap":
   ❌ GENERIC: "You're shopping and find a good deal"
   ✅ VIVID: "You've been eyeing $200 headphones for months. You walk into a store closing sale. They're $15. Your friend texts: 'How much?' You reply: 'DIRT CHEAP! Only $15!' - the phrase captures your shock and excitement"
   
   The scenario should make them FEEL when this phrase fits.

3. **THE VIBE** (How it feels to hear/use)
   
   Describe the emotional/social energy:
   - "Casual and excited - you sound pleasantly surprised"
   - "Professional and measured - you sound competent"
   - "Warm and apologetic - you soften a refusal"
   
   Help them understand the SOCIAL EFFECT of using this phrase.

4. **COMMON TRAP** (What learners get wrong)
   
   If relevant:
   - Context error: "Don't use this with your boss - too casual"
   - Meaning error: "'Cheap' can imply bad quality - be careful"
   - Grammar error: "Break the ice, not break ice"
   
   ONE specific warning, if important.

5. **PRAGMATIC TAGS** (For system - user never sees these)

RESPONSE FORMAT (JSON):

{
  "coreEssence": "One vivid sentence capturing the feeling",
  
  "memoryAnchor": "Specific, emotional scenario (2-3 sentences) where phrase is perfect",
  
  "theVibe": "How it FEELS to use/hear this - social and emotional energy",
  
  "commonTrap": "One specific thing learners often get wrong" OR null,
  
  "register": "informal|consultative|formal",
  
  "nuance": "negative|slightly_negative|neutral|slightly_positive|positive"
}

EXAMPLES:

For "break the ice":
{
  "coreEssence": "When you say or do something to make an awkward social situation more comfortable - usually at the beginning of meeting someone",
  
  "memoryAnchor": "First day at new job. Conference room. 10 strangers sitting in silence before meeting starts. You can feel the tension. Someone says: 'So... crazy weather lately, huh?' Everyone laughs. The ice is broken. Conversation starts flowing.",
  
  "theVibe": "Friendly and socially aware - you're the person who makes others comfortable",
  
  "commonTrap": "Don't announce it ('I'm going to break the ice now') - just DO it naturally. Also, it's specifically for NEW/AWKWARD situations, not ongoing conversations",
  
  "register": "consultative",
  "nuance": "positive"
}

For "I'm afraid I can't":
{
  "coreEssence": "A gentle, polite way to decline something - the 'afraid' softens the refusal and shows you're genuinely sorry",
  
  "memoryAnchor": "Your boss emails asking if you can work Saturday. You have family plans. You need to say no, but professionally. 'I'm afraid I can't' = polite, respectful decline without seeming rude or making excuses",
  
  "theVibe": "Apologetic and professional - you're declining but maintaining the relationship",
  
  "commonTrap": "Too formal for close friends (they'd just say 'I can't, sorry'). Use this for colleagues, bosses, formal requests",
  
  "register": "consultative",
  "nuance": "neutral"
}

TONE: Make it memorable, not academic. Paint pictures, not definitions.`
```

---

# <a name="category-6"></a>CATEGORY 6: EXERCISE GENERATION

## 6.1 Open-Ended Questions (NEW APPROACH)

**File:** `api/open-ended/generate/route.ts`

**AI Model:** DeepSeek

**Purpose:** Generate progressive questions based on SRS stage

### System Prompt

```other
You are a question designer creating exercises that test vocabulary understanding through story-based scenarios, never through explicit knowledge.
```

### User Prompt

```javascript
`Generate practice questions for these phrases:

${phraseList}

REVIEW STAGE: ${reviewNumber} (1-6+)

CRITICAL CONTEXT:
- Review 1-2: Recognition only (easy, observe & predict)
- Review 3-4: Comprehension (understand why/when)
- Review 5-6: Production (use with guidance)
- Review 6+: Free production (natural use)

QUESTION DESIGN PRINCIPLES:

❌ NEVER ASK:
- "What does [phrase] mean?"
- "Is [phrase] formal or informal?"
- "When would you use [phrase]?"
- "Translate [phrase]"

✅ ALWAYS ASK:
- Story-based scenarios where understanding phrase helps answer
- Social consequence questions
- Appropriateness judgments
- Context-fitting tasks

QUESTION TYPES BY REVIEW STAGE:

**REVIEW 1-2 (Recognition):**

Generate 5 questions from:
- 2x Social Consequence Prediction
  Example: "Mike tells his boss 'That's dirt cheap!' Boss likely responds:"
  A) "Great enthusiasm!" 
  B) "Could you use more professional language?" ✓
  
- 2x Situation Matching
  Example: "Which situation fits 'I'm afraid I can't'?"
  [Multiple checkboxes]
  ✓ Boss asks to work Saturday
  ✓ Formal event invitation
  ✗ Friend asks to hang out
  
- 1x Tone Interpretation
  Example: "Sarah says 'That's dirt cheap!' How does she feel?"
  A) Concerned about quality
  B) Excited about the deal ✓
  C) Confused about price

**REVIEW 3-4 (Comprehension):**

Generate 5 questions from:
- 2x Why Did They Say This
- 2x Appropriateness Judgment
- 1x Error Detection

**REVIEW 5-6 (Production):**

Generate 4 questions from:
- 2x Constrained Production
- 1x Transformation
- 1x Scenario-Based Production

**REVIEW 6+ (Mastery):**

Generate 4 questions from:
- 2x Scenario Production (new contexts)
- 1x Explain to Friend
- 1x Creative Use

RESPONSE FORMAT:

{
  "questions": [
    {
      "type": "social_consequence|situation_matching|tone_interpretation|etc.",
      "reviewStage": "recognition|comprehension|production|mastery",
      "question": "Full question text",
      "format": "multiple_choice|multi_select|open_text|transformation",
      "options": ["A", "B", "C", "D"] OR null,
      "correctAnswer": 1 OR null,
      "targetPhrases": ["phrase1", "phrase2"],
      "rubric": "For open questions: what makes a good answer"
    }
  ],
  "estimatedDuration": 240  // seconds
}

Use the 17 question types defined in the system. Match difficulty to review stage.`
```

---

# <a name="category-7"></a>CATEGORY 7: CLUSTERING

## 7.1 Cluster Phrases

**File:** `api/user/cluster-phrases/route.ts`

**AI Model:** DeepSeek

**Purpose:** Create scenario descriptions for phrase clusters

### System Prompt

```other
You are a JSON-only API.
```

### User Prompt

```javascript
`You are a Creative Scenario Architect.
Input: A list of PRE-GROUPED vocabulary clusters.
Task: Write a creative Title and Scenario Description for each cluster.

INPUT DATA:
${JSON.stringify(groupsPayload)}

INSTRUCTIONS:
1. Respect the Grouping: Do NOT move words between groups
2. Context: Write specific setting (e.g. "Drafting a legal contract")
3. Pragmatics: Ensure scenario fits register (Formal vs Casual)
4. Multi-Scene: If group has >5 words, suggest Multi-Scene Arc

When writing scenarios, ensure:
- Scenario creates NATURAL reason for ALL phrases to appear
- Don't force incompatible phrases together
- If phrases have different registers, scenario should accommodate both
  (e.g., email that includes both formal language and casual quote)
  
Return JSON with cluster titles and scenario descriptions.`
```

---

# <a name="examples"></a>PROMPT EXAMPLES LIBRARY

## Example Set 1: "dirt cheap" - Complete Journey

### Discovery Phase (Generate Meaning)

**Input:**

- Phrase: "dirt cheap"
- Context: "I found a shirt for $5! That's dirt cheap!"

**Output:**

```json
{
  "coreEssence": "When something costs shockingly less than expected - the kind of low price that makes you do a double-take",
  
  "memoryAnchor": "You've been watching those $150 sneakers for months, waiting for a sale. Black Friday hits. They're $30. You grab them and text your friend: 'OMG these are DIRT CHEAP!' The phrase perfectly captures that rush of 'I can't believe this price' excitement.",
  
  "theVibe": "Excited and informal - you sound genuinely surprised and happy about scoring an amazing deal. Very casual energy.",
  
  "commonTrap": "Don't use this in professional contexts (business emails, presentations) - it's too casual. Your boss might look confused. Also, it's about surprisingly LOW prices, not just any cheap thing.",
  
  "register": "informal",
  "nuance": "positive"
}
```

---

### Review 1 Questions (Recognition Phase)

**Question 1: Social Consequence**

```json
{
  "type": "social_consequence_prediction",
  "question": "Lisa tells her manager: 'This vendor's quote is dirt cheap!' How does her manager likely react?",
  "options": [
    "Impressed by Lisa's enthusiasm",
    "Confused by the informal language",
    "Immediately approves the vendor",
    "Asks Lisa to explain what 'dirt' means"
  ],
  "correct": 1,
  "targetPhrase": "dirt cheap",
  "rationale": "Manager would find 'dirt cheap' too casual for workplace - should use 'very affordable' or 'cost-effective'"
}
```

**Question 2: Situation Matching**

```json
{
  "type": "situation_matching",
  "question": "Where would you naturally hear 'dirt cheap'? (Select all that apply)",
  "format": "multi_select",
  "options": [
    "Friend texting about finding a great deal",
    "Business presentation to executives",
    "Social media post about shopping",
    "Formal email to professor"
  ],
  "correct": [0, 2],
  "targetPhrase": "dirt cheap"
}
```

**Question 3: Tone Interpretation**

```json
{
  "type": "tone_interpretation",
  "question": "Tom texts: 'Found flights to Miami! Dirt cheap - only $89!' How does Tom feel?",
  "options": [
    "Worried about the airline quality",
    "Excited about the unexpected low price",
    "Confused about the pricing",
    "Apologizing for choosing cheap flights"
  ],
  "correct": 1,
  "targetPhrase": "dirt cheap"
}
```

---

### Review 3 Questions (Comprehension Phase)

**Question 1: Why Did They Say This**

```json
{
  "type": "why_did_they_say",
  "question": "Sarah found a $700 apartment (usually $1500 in that area). She texted her friend 'dirt cheap!' instead of just 'cheap.' Why?",
  "options": [
    "She forgot the word 'cheap'",
    "'Dirt cheap' emphasizes how surprisingly low the price is",
    "'Dirt' refers to the apartment being dirty",
    "It's more polite than 'cheap'"
  ],
  "correct": 1,
  "targetPhrase": "dirt cheap"
}
```

**Question 2: Appropriateness Judgment**

```json
{
  "type": "appropriateness_judgment",
  "question": "Rate this message for a formal business proposal: 'Our solution is dirt cheap compared to competitors.' Natural ⭐⭐⭐⭐⭐ Unnatural",
  "format": "rating_scale",
  "correctRange": [1, 2],
  "feedback": "Unnatural! 'Dirt cheap' is too casual for business proposals. Use 'cost-effective' or 'competitively priced'",
  "targetPhrase": "dirt cheap"
}
```

---

### Review 5 Questions (Production Phase)

**Question 1: Constrained Production**

```json
{
  "type": "constrained_production",
  "question": "Your friend is stressed about expensive concert tickets. You just found resale tickets for $20 (originally $150). Text your friend the good news.",
  "constraints": [
    "Show excitement",
    "Mention the price is surprisingly low",
    "Keep it casual (you're texting a friend)"
  ],
  "targetPhrase": "dirt cheap",
  "rubric": {
    "natural": "Uses 'dirt cheap' or similar with genuine enthusiasm. Ex: 'OMG found tickets! Dirt cheap - only $20!'",
    "acceptable": "Conveys excitement and low price but slightly stiff. Ex: 'I found tickets that are very cheap, only $20'",
    "unnatural": "Announces the phrase or sounds robotic. Ex: 'I want to tell you these are dirt cheap'"
  }
}
```

**Question 2: Transformation Exercise**

```json
{
  "type": "transformation",
  "question": "Original (to friend): 'These headphones are dirt cheap!'\n\nRewrite for an email to your boss about office supplies:",
  "targetPhrase": "dirt cheap → appropriate professional alternative",
  "goodAnswers": [
    "These headphones are very cost-effective",
    "These headphones are quite affordable",
    "These represent excellent value"
  ],
  "avoidAnswers": [
    "These headphones are dirt cheap" (too casual)
  ]
}
```

---

### Review 7+ Questions (Mastery Phase)

**Question 1: Scenario Production (New Context)**

```json
{
  "type": "scenario_production",
  "question": "You're writing a product review for Amazon. You bought a phone case for $8 (competitors charge $30+). Write 2-3 sentences for your review mentioning the price.",
  "targetPhrase": "dirt cheap or appropriate alternative",
  "rubric": {
    "mastery": "Uses appropriate phrase for review context. 'Dirt cheap' works here because reviews are casual. Or uses 'incredibly affordable', 'amazing value' - all appropriate for online reviews.",
    "acceptable": "Mentions good price but generic. 'The price is very good'",
    "unnatural": "Wrong register or awkward phrasing"
  }
}
```

**Question 2: Explain to Friend**

```json
{
  "type": "explain_to_friend",
  "question": "Your friend (English learner) asks: 'Can I say 'dirt cheap' in my email to my professor about affordable textbooks?' Explain when to use 'dirt cheap' and when not to.",
  "targetPhrase": "dirt cheap",
  "rubric": {
    "excellent": "Explains it's too casual for professors, suggests alternatives like 'affordable' or 'reasonably priced', gives clear context about casual vs formal",
    "good": "Says it's too casual but doesn't explain why or give alternatives",
    "insufficient": "Just says 'no' without explanation"
  }
}
```

---

## Example Set 2: "I'm afraid I can't" - Complete Journey

### Discovery Phase

**Output:**

```json
{
  "coreEssence": "A polite, gentle way to decline a request or invitation - the 'I'm afraid' softens the refusal and shows regret",
  
  "memoryAnchor": "Your boss emails Friday afternoon: 'Can you join the client call tomorrow (Saturday) at 9 AM?' You have your sister's wedding. You can't be rude or too direct, but you absolutely can't do it. 'I'm afraid I can't - I have a family commitment' = professional refusal that maintains the relationship.",
  
  "theVibe": "Apologetic and professional - you're saying no but showing you wish you could say yes. It takes the edge off the refusal.",
  
  "commonTrap": "Don't use this with very close friends - it sounds too formal. Your best friend asks to hang out? Just say 'I can't, sorry!' not 'I'm afraid I can't.' Save this for colleagues, bosses, professional contacts, or polite situations.",
  
  "register": "consultative",
  "nuance": "neutral"
}
```

---

### Review 1 Questions

**Question 1: Social Consequence**

```json
{
  "type": "social_consequence",
  "question": "Compare two refusals to a boss's Saturday work request:\n\nA) 'No, I can't.'\nB) 'I'm afraid I can't.'\n\nWhat's the difference in how the boss perceives each?",
  "options": [
    "No difference - both are refusals",
    "A sounds too direct/potentially rude, B sounds more professional",
    "B shows the employee is actually afraid",
    "A is more honest than B"
  ],
  "correct": 1,
  "targetPhrase": "I'm afraid I can't"
}
```

**Question 2: Situation Matching**

```json
{
  "type": "situation_matching",
  "question": "When would 'I'm afraid I can't' fit well? (Select all that apply)",
  "format": "multi_select",
  "options": [
    "Declining a formal event invitation",
    "Telling your best friend you can't hang out tonight",
    "Politely refusing your boss's request",
    "Responding to a customer service request you can't fulfill"
  ],
  "correct": [0, 2, 3],
  "targetPhrase": "I'm afraid I can't"
}
```

---

### Review 3 Questions

**Question 1: Why Did They Say This**

```json
{
  "type": "why_did_they_say",
  "question": "Email exchange:\nClient: 'Can you deliver the report by Friday?'\nConsultant: 'I'm afraid I can't - the data won't be ready until Monday.'\n\nWhy did the consultant use 'I'm afraid I can't' instead of just 'I can't'?",
  "options": [
    "To show they're literally afraid of the client",
    "To soften the refusal and maintain professional relationship",
    "Because it's grammatically required in business emails",
    "To make the email longer and more formal"
  ],
  "correct": 1,
  "targetPhrase": "I'm afraid I can't"
}
```

**Question 2: Error Detection**

```json
{
  "type": "error_detection",
  "question": "Text message exchange:\nBest Friend: 'Want to grab lunch today?'\nYou: 'I'm afraid I cannot make it today.'\n\nWhat sounds a bit off?",
  "options": [
    "Nothing - this is perfect",
    "Too formal for a best friend - sounds stiff",
    "Should say 'I'm scared' instead of 'I'm afraid'",
    "'Cannot' should be 'can not'"
  ],
  "correct": 1,
  "targetPhrase": "I'm afraid I can't"
}
```

---

### Review 5 Questions

**Question 1: Constrained Production**

```json
{
  "type": "constrained_production",
  "question": "Your colleague (not close friend, professional relationship) asks if you can cover their shift this weekend. You have plans you can't change. Write a polite email declining.",
  "constraints": [
    "Maintain professional tone",
    "Decline clearly but politely",
    "Show you wish you could help"
  ],
  "targetPhrase": "I'm afraid I can't",
  "rubric": {
    "natural": "I'm afraid I can't - I have prior commitments this weekend. I wish I could help!",
    "acceptable": "I cannot cover the shift as I have other plans",
    "unnatural": "I am afraid I am unable to assist you" (too stiff)
  }
}
```

**Question 2: Transformation**

```json
{
  "type": "transformation",
  "question": "Original (to colleague): 'I'm afraid I can't make the meeting.'\n\nRewrite for your best friend who invited you to dinner:",
  "targetPhrase": "I'm afraid I can't → casual alternative",
  "goodAnswers": [
    "Can't make it, sorry!",
    "Ah man, I can't - already have plans",
    "Sorry, can't do dinner tonight"
  ],
  "avoidAnswers": [
    "I'm afraid I cannot attend" (too formal for best friend)
  ]
}
```

---

## Example Set 3: Multi-Phrase Exercise

### Reading Passage with Multiple Phrases

**Phrases:** "dirt cheap", "affordable", "economical"

**Generated Passage:**

```other
Sarah had been apartment hunting for three brutal months. Every listing was either a dump or way over her budget. She was starting to panic—her temp housing ended in two weeks.

Then she saw it: $700 for a one-bedroom downtown. She clicked immediately, expecting the catch. Broken windows? Roach infestation? But the photos looked... normal.

She texted her friend Mike: "Found a place. Dirt cheap!"

Mike's response was instant: "Where's the catch? That area's usually $1500."

Good question. Sarah called the landlord, a woman named Carol who explained: "My daughter just left for college. I'd rather rent to someone reliable than deal with corporate property managers. It's more economical for both of us this way."

At the viewing, Sarah inspected everything. The apartment was small but clean. Everything worked. She couldn't believe her luck.

That evening, she called her mom. "I found a place! Really affordable—$700 for downtown."

"That's wonderful! Is it safe?"

"Yeah, I checked everything. The landlord just wants someone trustworthy instead of going through agencies."

Her mom laughed. "Well, don't tell your father the exact number. He'll think you're lying."
```

**Questions (Review 1):**

```json
[
  {
    "question": "Why does Mike respond with skepticism to Sarah's 'dirt cheap' text?",
    "options": [
      "He doesn't trust Sarah's judgment",
      "The price is surprisingly low for that neighborhood",
      "He thinks Sarah is exaggerating",
      "He wants Sarah to find a more expensive place"
    ],
    "correct": 1,
    "targetPhrase": "dirt cheap"
  },
  {
    "question": "Why does Carol use 'economical' when explaining the rent price?",
    "options": [
      "She's showing off her vocabulary",
      "She's being professional while explaining her business decision",
      "'Economical' means something different from 'cheap'",
      "She doesn't know the word 'affordable'"
    ],
    "correct": 1,
    "targetPhrase": "economical"
  },
  {
    "question": "How does Sarah's word choice change from texting Mike to calling her mom?",
    "options": [
      "She uses the same words with both",
      "She's more excited with Mike than with her mom",
      "She uses 'dirt cheap' (casual) with Mike, 'affordable' (neutral) with mom",
      "She lies to her mom about the price"
    ],
    "correct": 2,
    "targetPhrase": "dirt cheap vs affordable (pragmatic shift)"
  }
]
```

---

