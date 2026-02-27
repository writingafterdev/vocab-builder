/**
 * VocabBuilder Prompts Library
 * 
 * CORE PHILOSOPHY: Naturalness & Accuracy
 * Every prompt asks: "Would a native speaker say it this way?"
 * 
 * All prompts include few-shot examples for consistent AI behavior.
 */

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

export const NATURALNESS_SCALE = {
    NATIVE: 5,      // Perfect. A native would say exactly this.
    NATURAL: 4,     // Natural with very minor awkwardness
    ACCEPTABLE: 3,  // Understandable but sounds like a learner
    AWKWARD: 2,     // Grammatically okay but unnatural phrasing
    UNNATURAL: 1,   // Would sound strange or confusing to natives
} as const;

export const PHRASE_USAGE_LEVELS = {
    NATURAL: 'natural',       // Used perfectly, sounds native
    ACCEPTABLE: 'acceptable', // Correct but slightly awkward
    FORCED: 'forced',         // Grammatically shoehorned in
    INCORRECT: 'incorrect',   // Wrong meaning or usage
    NOT_USED: 'not_used',     // Phrase not present
} as const;

// ============================================================================
// PHRASE DETECTION PROMPT
// ============================================================================

export function buildPhraseDetectionPrompt(
    targetPhrases: Array<{ phrase: string; meaning: string }>,
    userResponse: string
): string {
    const phraseList = targetPhrases
        .map((p, i) => `${i + 1}. "${p.phrase}" - ${p.meaning}`)
        .join('\n');

    return `You are a native English speaker with 10+ years of ESL teaching experience. You evaluate whether someone used phrases NATURALLY — not just correctly.

TARGET PHRASES:
${phraseList}

USER'S RESPONSE:
"${userResponse}"

YOUR TASK: For each phrase, determine if they used it NATURALLY (not just correctly).

## SCORING GUIDE

- **NATURAL** (5): Perfect usage. You'd say it exactly this way.
- **ACCEPTABLE** (4): Correct but slightly stiff/textbook-ish
- **FORCED** (3): Grammatically crammed in, doesn't flow
- **INCORRECT** (2): Wrong meaning, grammar, or context
- **NOT_USED** (1): Phrase not present

## BOUNDARY CASE: Score 3 vs 4
Score 4: "My company sometimes cuts corners to meet deadlines."
→ Correct meaning, appropriate context, but missing the natural emotional weight. Score 4.

Score 3: "I eat breakfast. Also I want to talk about cutting corners which is bad."
→ Forced in, doesn't flow, no real context. Score 3.

## EXAMPLES

### Example 1: NATURAL ✓
Phrase: "cut corners"
Response: "I know the project is behind schedule, but we can't afford to cut corners on safety."
Score: NATURAL
Why: Perfect context, natural flow, correct meaning

### Example 2: ACCEPTABLE
Phrase: "cut corners"  
Response: "My company cuts corners sometimes."
Score: ACCEPTABLE
Why: Correct meaning but generic - lacks the natural context natives would add

### Example 3: FORCED
Phrase: "cut corners"
Response: "I eat breakfast. Also I want to talk about cutting corners which is bad."
Score: FORCED
Why: Shoehorned in, doesn't flow naturally, no real context

### Example 4: INCORRECT
Phrase: "cut corners"
Response: "I cut the corners of the paper with scissors."
Score: INCORRECT
Why: Literal meaning, not the idiom

## RESPOND IN JSON (reason BEFORE scoring):
{
    "detections": [
        {
            "phrase": "the phrase",
            "usedForm": "exact words they used" or null,
            "reasoning": "Think step by step: 1) Did they use it? 2) Is the meaning correct? 3) Does it flow naturally in context? 4) Would a native say it this way?",
            "score": "NATURAL|ACCEPTABLE|FORCED|INCORRECT|NOT_USED",
            "confidence": "high|medium|low",
            "nativeAlternative": "how a native would say it better" or null
        }
    ]
}`;
}

// ============================================================================
// SPEAKING ANALYSIS PROMPT
// ============================================================================

export function buildSpeakingAnalysisPrompt(
    questionText: string,
    questionContext: string | undefined,
    targetPhrases: Array<{ id: string; phrase: string; meaning: string }>,
    userLevel?: string
): string {
    const phraseList = targetPhrases
        .map((p, i) => `${i + 1}. "${p.phrase}" - ${p.meaning}`)
        .join('\n');

    return `You are a native English speaker with deep expertise in conversational fluency assessment. You evaluate spoken responses for naturalness.

QUESTION: "${questionText}"
${questionContext ? `CONTEXT: ${questionContext}` : ''}
${userLevel ? `LEARNER LEVEL: ${userLevel}` : ''}

TARGET PHRASES:
${phraseList}

## YOUR SINGLE QUESTION:
"Does this sound like something I (a native) would actually say?"

## NATURALNESS SCORING

5 = Native: I'd say this exactly. Perfect.
4 = Natural: Very good with minor awkwardness
3 = Acceptable: Understandable but "learner-ish"
2 = Awkward: Grammatically okay but sounds off
1 = Unnatural: Would confuse or sound wrong

## BOUNDARY CASE: Score 3 vs 4
Score 4: "Honestly, I just try to keep my head above water most days."
→ Natural flow, correct idiom, but missing the elaboration a native would add. Score 4.

Score 3: "I am keeping my head above water. Work is very busy."
→ No contractions, no natural hedging, sounds textbook. Score 3.

## EXAMPLES

### Example: Score 5 (Native)
Question: "What do you do when you're stressed?"
Response: "Honestly? I just try to keep my head above water most days. Between work and family stuff, there's not much time for anything else."
Why: Natural flow, appropriate filler ("Honestly?"), real emotion, phrase fits perfectly

### Example: Score 3 (Acceptable)
Question: "What do you do when you're stressed?"
Response: "I am keeping my head above water. Work is very busy."
Why: Grammar fine but stiff - no contractions, no natural hedging, sounds like textbook

### Example: Score 1 (Unnatural)
Question: "What do you do when you're stressed?"
Response: "I keep the head above water because stress is happening."
Why: Wrong article, mechanical phrasing, unnatural construction

## PHRASE USAGE EVALUATION

For each target phrase, answer:
1. Did they use it? (yes/no)
2. Was it NATURAL or FORCED?
3. How would YOU (native) say it in this context?

## RESPOND IN JSON (reason BEFORE scoring):
{
    "transcript": "what you heard",
    "reasoning": "Think step by step: What sounds natural? What sounds off? Why?",
    "naturalnessScore": 1-5,
    "confidence": "high|medium|low",
    "naturalnessFeedback": "specific feedback on what sounds natural/unnatural",
    "phrases": [
        {
            "phraseId": "id",
            "phrase": "the phrase",
            "used": true/false,
            "natural": true/false,
            "feedback": "brief note",
            "nativeVersion": "how a native would say it"
        }
    ],
    "overallFeedback": "2-3 sentences of constructive feedback",
    "nativeExample": "Here's how I (native) might answer this question using the phrases..."
}`;
}

// ============================================================================
// EVALUATE PRODUCTION PROMPT
// ============================================================================

export function buildEvaluateProductionPrompt(
    userAnswer: string,
    phrases: Array<{ phrase: string; meaning: string }>,
    scenario?: string,
    sampleResponse?: string
): string {
    const phraseList = phrases
        .map(p => `- "${p.phrase}": ${p.meaning}`)
        .join('\n');

    return `You are a native English speaker with expertise in writing assessment. You evaluate written responses for naturalness and tone appropriateness.

## CONTEXT
${scenario ? `SCENARIO: ${scenario}` : 'Open response'}
${sampleResponse ? `EXPECTED APPROACH: ${sampleResponse}` : ''}

TARGET PHRASES:
${phraseList}

USER'S ANSWER:
"${userAnswer}"

## EVALUATION FOCUS: NATURALNESS FIRST

Don't just check grammar. Ask yourself:
1. "Would I (a native) write it this way?"
2. "Does it sound natural for this situation?"
3. "Is the tone appropriate?" (casual/formal/professional)

## BOUNDARY CASE: Score 60 vs 75
Score 75: "Hey, quick heads up — the report's going to be a bit late. I'll keep you posted."
→ Natural tone for a colleague, correct phrase usage, but missing specifics (when? why?). Score 75.

Score 60: "I am writing to inform you that the report is delayed. I will give you a heads up when it is ready."
→ Grammar perfect but robotic. "Give you a heads up" is slightly off — we usually GET a heads up proactively. Score 60.

## EXAMPLES

### Example 1: High Score (Natural + Accurate)
Scenario: Email to colleague about a delay
User: "Hey, just a heads up - we're running a bit behind on the report. I'll keep you posted on when we can get it to you."
Score: 95/100
Why: Natural greeting, appropriate idiom, casual but professional tone, flows naturally

### Example 2: Medium Score (Correct but Stiff)
Scenario: Email to colleague about a delay
User: "I am writing to inform you that the report is delayed. I will give you a heads up when it is ready."
Score: 60/100
Why: Grammar perfect but sounds robotic. "Give you a heads up" is slightly off - we usually GET a heads up or give one proactively, not after the fact

### Example 3: Low Score (Unnatural)
Scenario: Email to colleague about a delay
User: "Hello. Heads up is needed about the report. It is making delay."
Score: 25/100
Why: Awkward construction, phrase used as noun incorrectly, "making delay" is not natural

## RESPOND IN JSON (reason BEFORE scoring):
{
    "reasoning": "Think step by step: 1) What's the expected tone for this scenario? 2) Does the writing match that tone? 3) Are phrases used naturally or forced?",
    "naturalnessScore": 0-100,
    "confidence": "high|medium|low",
    "phraseResults": [
        {
            "phrase": "phrase",
            "used": true/false,
            "natural": true/false,
            "feedback": "specific feedback",
            "nativeVersion": "how a native would phrase it"
        }
    ],
    "toneAssessment": {
        "appropriate": true/false,
        "detected": "casual/formal/mixed",
        "expected": "what tone was expected",
        "issue": "if inappropriate, what's wrong"
    },
    "overallFeedback": "2-3 sentences, be specific",
    "nativeRewrite": "If I were writing this, I'd say: ..."
}`;
}

// ============================================================================
// GENERATE MEANING PROMPT
// ============================================================================

export function buildGenerateMeaningPrompt(
    phrase: string,
    context?: string
): string {
    return `You are helping an English learner understand when and how natives ACTUALLY use a phrase.

PHRASE: "${phrase}"
${context ? `FOUND IN: "${context}"` : ''}

## WHAT LEARNERS NEED

Not dictionary definitions. They need to know:
1. WHEN do natives use this? (specific situations)
2. WHO says it to WHOM? (friends? boss? strangers?)
3. WHAT TONE does it carry? (frustrated? joking? sympathetic?)
4. HOW would I know when to use it myself?

## EXAMPLE FORMAT

### Phrase: "cut corners"

**What it means:**
To do something in a cheaper or easier way, usually sacrificing quality. Often implies something risky or unethical.

**When natives use it:**
- Complaining about poor quality work: "They clearly cut corners on this renovation"
- Warning against shortcuts: "We can't afford to cut corners on safety"
- Admitting to taking shortcuts: "I may have cut a few corners on the report"

**The feel:**
Slightly negative. Implies the person knew they were doing something suboptimal. Often used critically or apologetically.

**Real conversation:**
A: "Did you see the new building downtown?"
B: "Yeah, it looks nice but I heard they cut corners on the foundation. I wouldn't buy there."

**When NOT to use:**
- Don't use for literal corner-cutting (paper, driving)
- Don't use positively ("I efficiently cut corners") - it has negative connotation
- Don't use for minor shortcuts ("I cut corners by using a calculator")

**Native variations:**
- "take shortcuts" (more neutral)
- "do a half-assed job" (more negative, informal)
- "skim on [something]" (British)

---

## RESPOND IN JSON:
{
    "meaning": "2-3 sentence clear explanation",
    "whenToUse": ["situation 1", "situation 2", "situation 3"],
    "whoToWhom": "friend to friend / employee to boss / etc",
    "tone": "the emotional feel of this phrase",
    "realConversation": "A: ... B: ...",
    "whenNotToUse": ["don't use when...", "avoid if..."],
    "nativeVariations": ["alternative 1", "alternative 2"],
    "commonMistakes": ["learners often...", "avoid..."]
}`;
}

// ============================================================================
// CONVERSATION TURN EVALUATION PROMPT
// ============================================================================

export function buildConversationTurnPrompt(
    aiMessage: string,
    userResponse: string,
    targetPhrases: string[],
    conversationContext?: string
): string {
    return `You are a native English speaker in a conversation. Evaluate this response.

## CONVERSATION
${conversationContext ? `Context: ${conversationContext}` : ''}

AI said: "${aiMessage}"
User replied: "${userResponse}"

Target phrases to encourage: ${targetPhrases.join(', ')}

## EVALUATE NATURALNESS

Ask yourself: "If a friend replied like this, would I think anything was off?"

### Good response patterns:
- Responds to what was actually said
- Contains appropriate acknowledgment ("Yeah, totally", "I know what you mean")
- Natural follow-up or expansion
- Phrases fit organically, not shoehorned

### Warning signs:
- Ignores the AI's question/comment
- Topic jump without transition
- Forced phrase insertion
- Too formal for casual chat (or vice versa)

## EXAMPLE

AI: "So what's been keeping you busy lately?"
User: "Oh man, work has been crazy. I've been pulling all-nighters just to keep my head above water."

Score: 5/5 Natural
Why: 
- Answers the question directly
- Natural opener ("Oh man")
- Phrase fits the context perfectly
- Casual tone matches the question

---

AI: "So what's been keeping you busy lately?"  
User: "I am busy. I keep my head above water at work."

Score: 2/5 Awkward
Why:
- Too brief, doesn't engage
- Missing natural elements (contractions, elaboration)
- Phrase feels inserted rather than organic

## RESPOND IN JSON:
{
    "naturalness": 1-5,
    "respondsToContext": true/false,
    "phraseUsage": [
        { "phrase": "...", "used": true/false, "natural": true/false }
    ],
    "feedback": "specific feedback",
    "betterVersion": "How a native might say this: ..."
}`;
}

// ============================================================================
// OPEN-ENDED QUESTION GENERATION PROMPT
// ============================================================================

export function buildQuestionGenerationPrompt(
    phrases: Array<{ id: string; phrase: string; meaning: string }>,
    userLevel?: string,
    userInterests?: string[]
): string {
    const phraseList = phrases
        .map((p, i) => `${i + 1}. "${p.phrase}" (ID: ${p.id}) - ${p.meaning}`)
        .join('\n');

    return `Create interview questions that naturally elicit specific phrases.

${userLevel ? `LEARNER LEVEL: ${userLevel}` : ''}
${userInterests?.length ? `INTERESTS: ${userInterests.join(', ')}` : ''}

TARGET PHRASES:
${phraseList}

## THE GOAL

Create questions where a native speaker would NATURALLY use these phrases.
Not "use this phrase in a sentence" - real questions that organically lead to these phrases.

## GOOD vs BAD QUESTIONS

### BAD (too direct):
"Can you give an example of a time you cut corners?"
Why bad: Forces the phrase, feels like a test

### GOOD (natural elicitation):
"Tell me about a time when you had too much work and not enough time. How did you handle it?"
Why good: Native might naturally say "I had to cut a few corners" or "I was just trying to keep my head above water"

### BAD (too vague):
"Tell me about work."
Why bad: Too broad, phrase might not come up naturally

### GOOD (focused but open):
"What's the most challenging project you've worked on? Were there any shortcuts you had to take?"
Why good: Naturally steers toward "cut corners" without forcing it

## STRUCTURE

1. Warm-up question (easy, builds comfort)
2. Main questions (2-3 phrases each)
3. Follow-ups (for phrases that might not come up)

Total: 4-6 questions with natural flow

## RESPOND IN JSON:
{
    "questions": [
        {
            "id": "q1",
            "text": "the question",
            "targetPhraseIds": ["phrase_id_1", "phrase_id_2"],
            "intent": "why this question might elicit these phrases",
            "followUp": {
                "id": "q1_follow",
                "text": "follow-up if phrases don't come up naturally",
                "targetPhraseIds": ["phrase_id_1"]
            }
        }
    ]
}`;
}

// ============================================================================
// CONTENT GENERATION PROMPTS (Listening/Reading)
// ============================================================================

export function buildListeningScriptPrompt(
    phrases: Array<{ phrase: string; meaning: string }>,
    format: 'dialogue' | 'monologue',
    userLevel?: string
): string {
    const phraseList = phrases
        .map((p, i) => `${i + 1}. "${p.phrase}" - ${p.meaning}`)
        .join('\n');

    return `Write a ${format} script that sounds 100% natural - like real native conversation.

${userLevel ? `TARGET LEVEL: ${userLevel}` : ''}

## PHRASES TO INCLUDE NATURALLY:
${phraseList}

## CRITICAL: SOUND NATIVE

### What makes dialogue NATURAL:
- Interruptions and overlaps
- Incomplete sentences
- Filler words (um, like, you know, I mean)
- Contractions (don't, I'd, they're)
- Informal phrases (kind of, sort of, pretty much)
- Real reactions (Really? No way! That's crazy)
- Topic drift and returns

### What sounds UNNATURAL:
- Perfect grammar throughout
- Complete sentences every time
- No hesitation or fillers
- Formal vocabulary in casual settings
- Phrase clearly inserted for learning purposes

## EXAMPLE

### UNNATURAL (avoid this):
A: "Hello. I have been cutting corners at work."
B: "That is concerning. Cutting corners can lead to problems."
A: "Yes, I will stop cutting corners."

### NATURAL (aim for this):
A: "So how's the new job going?"
B: "Honestly? It's been... rough. Like, they want everything done yesterday, you know?"
A: "Oh no, that sounds exhausting."
B: "Yeah. I've kinda been cutting corners just to get stuff done. Not proud of it, but..."
A: "I mean, what choice do you have, right?"

## RESPOND IN JSON:
{
    "title": "catchy title",
    "format": "dialogue" or "monologue",
    "setting": "where/when this takes place",
    "speakers": 2,
    "script": [
        { "speaker": "A", "text": "line 1" },
        { "speaker": "B", "text": "line 2" }
    ],
    "durationEstimate": "1-2 minutes",
    "phraseLocations": [
        { "phrase": "...", "speakerIndex": 0, "lineIndex": 3 }
    ]
}`;
}

// ============================================================================
// DAILY DRILL PROMPT
// ============================================================================

export function buildDailyDrillPrompt(
    weakness: {
        category: string;
        specific: string;
        examples: string[];
        correction: string;
        explanation: string;
    },
    exerciseType: 'register_choice' | 'nuance_match' | 'collocation_fill'
): string {
    return `Create a quick exercise to address this specific weakness.

## WEAKNESS
Category: ${weakness.category}
Issue: ${weakness.specific}
Example error: "${weakness.examples[0]}"
Correct form: "${weakness.correction}"
Why: ${weakness.explanation}

Exercise type: ${exerciseType}

## EXERCISE TYPES

### register_choice
Test if they know WHEN to use casual vs formal
- Give a situation
- Give 3 options (1 correct register, 2 wrong)
- The "wrong" ones should be grammatically correct but wrong tone

Example:
Situation: "Texting a close friend about weekend plans"
Options:
A) "Would you be available this Saturday?" ❌ (too formal)
B) "You free Saturday?" ✓ (natural for friends)
C) "I hereby request your presence Saturday" ❌ (way too formal)

### nuance_match
Test if they understand subtle meaning differences
- Give a scenario
- Give 3 similar phrases
- Only one fits the EXACT nuance needed

Example:
Scenario: "Your colleague is complaining about too much work"
Options:
A) "You're swamped" ✓ (acknowledges overwhelm)
B) "You're busy" ❌ (too weak, sounds dismissive)
C) "You're slacking" ❌ (opposite meaning!)

### collocation_fill
Test natural word partnerships
- Give a sentence with blank
- Give 3 options that all "could" fit grammatically
- Only one is what natives actually say

Example:
"I need to ___ a decision about the job offer."
A) do ❌ (grammatical but not natural)
B) make ✓ (natural collocation)
C) take ❌ (grammatical but "take a decision" is less common)

## RESPOND IN JSON:
{
    "instruction": "Choose the most natural option for...",
    "scenario": "the situation",
    "options": ["A", "B", "C"],
    "correctAnswer": "B",
    "explanation": "Why B is correct and why others are wrong (be specific)"
}`;
}
