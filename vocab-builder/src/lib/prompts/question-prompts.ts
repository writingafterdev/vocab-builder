/**
 * Question Type Prompts - System Design.md Aligned
 * 
 * Each prompt includes:
 * - PURPOSE: What this question type teaches
 * - INSTRUCTIONS: Exactly what AI should generate
 * - EXAMPLES: Show correct output format
 * - EFFECTS: Expected learning outcome
 */

import { ExerciseQuestionType } from '@/lib/db/types';

// Duration estimates in seconds for each question type
export const DURATION_ESTIMATES: Record<ExerciseQuestionType, number> = {
    // Recognition (fast, low cognitive load)
    social_consequence_prediction: 30,
    situation_phrase_matching: 40,
    tone_interpretation: 25,
    contrast_exposure: 30,

    // Comprehension (medium)
    why_did_they_say: 40,
    appropriateness_judgment: 40,
    error_detection: 35,
    fill_gap_mcq: 25,
    register_sorting: 45,
    reading_comprehension: 50,
    sentence_correction: 40,

    // Guided Production (higher)
    constrained_production: 60,
    transformation_exercise: 50,
    dialogue_completion_open: 70,
    text_completion: 55,

    // Mastery (highest)
    scenario_production: 120,
    multiple_response_generation: 90,
    explain_to_friend: 90,
    creative_context_use: 60,

    // Story/Listening specific
    story_intro: 0,
    listen_select: 30,
    type_what_you_hear: 45,
};

// Phase configuration from System Design.md
export const QUESTION_TYPE_PROGRESSION = {
    // Review 1-2: RECOGNITION AND GUIDED PRODUCTION PHASE
    "review_1-2": {
        phase: "recognition",
        cognitiveLoad: "low-to-medium",
        duration: "4-6 minutes",
        questionCount: 5,
        allowedTypes: [
            // Passive/Recognition
            { type: "social_consequence_prediction" as const, weight: 0.25, min: 1, max: 2 },
            { type: "situation_phrase_matching" as const, weight: 0.25, min: 1, max: 2 },
            { type: "tone_interpretation" as const, weight: 0.1, min: 0, max: 1 },
            { type: "contrast_exposure" as const, weight: 0.1, min: 0, max: 1 },
            // Production/Active Recall
            { type: "fill_gap_mcq" as const, weight: 0.2, min: 1, max: 2 },
            { type: "dialogue_completion_open" as const, weight: 0.1, min: 0, max: 1 }
        ],
        avoidTypes: ["scenario_production", "explain_to_friend", "creative_context_use"]
    },

    // Review 3-4: COMPREHENSION AND PRODUCTION PHASE
    "review_3-4": {
        phase: "comprehension",
        cognitiveLoad: "medium",
        duration: "5-7 minutes",
        questionCount: 6,
        allowedTypes: [
            // Passive/Comprehension
            { type: "why_did_they_say" as const, weight: 0.15, min: 1, max: 2 },
            { type: "appropriateness_judgment" as const, weight: 0.15, min: 1, max: 2 },
            { type: "error_detection" as const, weight: 0.1, min: 0, max: 1 },
            { type: "reading_comprehension" as const, weight: 0.15, min: 1, max: 2 },
            { type: "sentence_correction" as const, weight: 0.1, min: 0, max: 1 },
            // Production/Active
            { type: "fill_gap_mcq" as const, weight: 0.15, min: 1, max: 2 },
            { type: "constrained_production" as const, weight: 0.2, min: 1, max: 2 }
        ],
        avoidTypes: ["scenario_production", "explain_to_friend", "creative_context_use"]
    },

    // Review 5-6: GUIDED PRODUCTION AND RECOGNITION PHASE
    "review_5-6": {
        phase: "guided_production",
        cognitiveLoad: "medium-high",
        duration: "6-8 minutes",
        questionCount: 6,
        allowedTypes: [
            // Production
            { type: "constrained_production" as const, weight: 0.25, min: 1, max: 2 },
            { type: "transformation_exercise" as const, weight: 0.2, min: 1, max: 2 },
            { type: "dialogue_completion_open" as const, weight: 0.2, min: 1, max: 2 },
            { type: "text_completion" as const, weight: 0.15, min: 0, max: 1 },
            // Passive/Review
            { type: "register_sorting" as const, weight: 0.1, min: 0, max: 1 },
            { type: "situation_phrase_matching" as const, weight: 0.1, min: 0, max: 1 }
        ],
        avoidTypes: ["social_consequence_prediction", "tone_interpretation"]
    },

    // Review 7+: MASTERY / FREE PRODUCTION AND COMPREHENSION
    "review_7+": {
        phase: "mastery",
        cognitiveLoad: "high",
        duration: "7-10 minutes",
        questionCount: 6,
        allowedTypes: [
            // Mastery Production
            { type: "scenario_production" as const, weight: 0.25, min: 1, max: 2 },
            { type: "multiple_response_generation" as const, weight: 0.2, min: 1, max: 2 },
            { type: "explain_to_friend" as const, weight: 0.15, min: 1, max: 1 },
            { type: "creative_context_use" as const, weight: 0.1, min: 0, max: 1 },
            // Tricky Passive Review
            { type: "sentence_correction" as const, weight: 0.15, min: 1, max: 1 },
            { type: "reading_comprehension" as const, weight: 0.15, min: 1, max: 1 }
        ],
        avoidTypes: []  // All types allowed at mastery
    }
};

export function getPhase(learningStep: number): keyof typeof QUESTION_TYPE_PROGRESSION {
    if (learningStep <= 2) return "review_1-2";
    if (learningStep <= 4) return "review_3-4";
    if (learningStep <= 6) return "review_5-6";
    return "review_7+";
}
/**
 * Shared quality preamble — prepended to all question generation prompts.
 * Contains universal anti-patterns, output constraints, and difficulty guidance.
 */
export const QUESTION_QUALITY_PREAMBLE = `
## UNIVERSAL QUALITY RULES (apply to EVERY question type)

### ANTI-PATTERNS — Never do these:
❌ Generic contexts: "At work", "With friends", "In daily life"
❌ Boring scenarios: "Tom is at the store." Make it punchy, dramatic, or funny!
❌ Obvious distractors: Options that no learner would ever pick
❌ Definition-only explanations: "X means Y" without teaching WHY it fits
❌ Unnaturally long correct answers: Don't reveal the answer by length
❌ Phrase announced in context: "I want to use the phrase 'break the ice'" 
❌ Identical sentence structure across options: Vary phrasing

### TONE & ENGAGEMENT:
✨ MAKE IT FUN: Scenarios should be slightly unexpected, humorous, dramatic, or relatable in a quirky way. Give characters personality, use high stakes (e.g., trying to impress a terrifying mother-in-law, accidentally sending a text to the wrong boss), or add a plot twist. 

### OUTPUT FIELD CONSTRAINTS:
- "context" / "scenario": 1-3 sentences, specific enough to visualize as a movie scene
- "options": 3-4 choices, each 2-10 words, roughly equal length
- "explanation": 1-2 sentences, MUST explain the distinction between correct and best distractor
- "correctIndex": 0-based integer
- Never put the correct answer in the same position (index 0) for every question

### DIFFICULTY BY PHASE:
- RECOGNITION (Review 1-2): 1 clearly wrong option, 2 plausible, 1 correct. Learner builds intuition.
- COMPREHENSION (Review 3-4): All options plausible. Test pragmatic/register understanding.
- GUIDED PRODUCTION (Review 5-6): Open-ended or constrained tasks. Focus on natural usage.
- MASTERY (Review 7+): All options highly plausible. Test fine-grained nuance and creative usage.
`;

/**
 * RECOGNITION PHASE PROMPTS (Review 1-2)
 * Purpose: Build intuition through observation, not explanation
 */

export const RECOGNITION_PROMPTS = {
    social_consequence_prediction: `
PURPOSE: Teach social impact of word choice WITHOUT explicit explanation
USER LEARNS: What happens when I use this phrase correctly vs incorrectly

GENERATE: A mini-story (2-3 sentences) showing a situation, then ask what happens next

STRUCTURE:
{
    "type": "social_consequence_prediction",
    "content": {
        "context": "Mini-story setting up situation with TARGET PHRASE used",
        "question": "What happens next?",
        "options": [
            "A) Positive social outcome (if phrase used correctly) ✓",
            "B) Awkward/negative outcome (wrong register)",
            "C) Confusion (wrong meaning assumed)",
            "D) Neutral outcome (phrase not understood)"
        ],
        "correctIndex": 0,
        "explanation": "Why this social consequence follows from the phrase"
    }
}

EXAMPLE:
Context: "Tom just met his new CEO at the company mixer. After an awkward silence, he says: 'So... crazy weather we're having, right?'"
Question: "What likely happens next?"
A) The CEO smiles and small talk begins ✓
B) The CEO looks confused and walks away
C) Tom gets fired for being too casual
D) Nothing changes

LEARNING EFFECT: User learns that "breaking the ice" leads to connection, not awkwardness

CRITICAL RULES:
- Context must show phrase IN USE, not as announcement
- Correct answer = realistic social outcome
- Distractors = literal misinterpretation, wrong register consequence, no effect
`,

    situation_phrase_matching: `
PURPOSE: Build phrase-to-situation mapping intuition
USER LEARNS: "When I'm in X situation, I should reach for Y phrase"

GENERATE: A situation description + 3-4 phrase options (MCQ)

STRUCTURE:
{
    "type": "situation_phrase_matching",
    "content": {
        "context": "Vivid situation description (1-2 sentences)",
        "prompt": "What someone said or the trigger event",
        "options": [
            "Phrase that fits perfectly ✓",
            "Phrase that's too formal/casual",
            "Phrase with similar words but wrong meaning",
            "Phrase that could work but is less natural"
        ],
        "correctIndex": 0,
        "explanation": "Why this phrase fits AND why others don't"
    }
}

EXAMPLE:
Context: "Your friend just showed you an apartment listing for $700/month in a neighborhood where rent is usually $1500+."
Prompt: "You can't believe the price. What do you say?"
A) "That's dirt cheap!" ✓
B) "That is very inexpensive"
C) "That looks cheap"
D) "That's a bargain"

LEARNING EFFECT: User associates "dirt cheap" with excited surprise at unexpectedly low price

CRITICAL RULES:
- Situation must create EMOTIONAL context (excitement, relief, frustration)
- Correct answer = most natural native response
- Include one "textbook correct but sounds translated" option
`,

    tone_interpretation: `
PURPOSE: Teach emotional/attitudinal qualities of phrases
USER LEARNS: How a phrase FEELS, not just what it means

GENERATE: A dialogue snippet where user must identify speaker's emotion

STRUCTURE:
{
    "type": "tone_interpretation",
    "content": {
        "context": "Brief situation (1 sentence)",
        "dialogue": "Speaker says target phrase in context",
        "question": "How does [speaker] feel when saying this?",
        "options": [
            "Correct emotion/attitude ✓",
            "Opposite emotion",
            "Wrong intensity (too strong/weak)",
            "Related but incorrect emotion"
        ],
        "correctIndex": 0,
        "explanation": "What in the phrase signals this emotion"
    }
}

EXAMPLE:
Context: "Sarah's boss asks her to work Saturday."
Dialogue: "Sarah sighs and says: 'I'm afraid I can't. I have family plans.'"
Question: "How does Sarah feel?"
A) Apologetic but firm ✓
B) Angry and defiant
C) Excited about the weekend
D) Confused about the request

LEARNING EFFECT: User associates "I'm afraid" with polite reluctance, NOT literal fear
`,

    contrast_exposure: `
PURPOSE: Show subtle differences between confusable phrases
USER LEARNS: The NUANCE difference through consequences, not definitions

GENERATE: Side-by-side comparison of two similar phrases showing different outcomes

STRUCTURE:
{
    "type": "contrast_exposure",
    "content": {
        "phrase1": "cheap",
        "phrase2": "inexpensive",
        "context": "Shopping with a friend for furniture",
        "scenario1": "Lisa says 'This chair is cheap' → Sarah's face falls slightly",
        "scenario2": "Lisa says 'This chair is inexpensive' → Sarah nods approvingly",
        "question": "What's the difference in effect?",
        "explanation": "'Cheap' implies low quality; 'inexpensive' is neutral about quality"
    }
}

LEARNING EFFECT: User learns nuance difference through social consequence, not dictionary definition
`
};

/**
 * COMPREHENSION PHASE PROMPTS (Review 3-4)
 * Purpose: Deepen understanding of WHY phrases work
 */

export const COMPREHENSION_PROMPTS = {
    why_did_they_say: `
PURPOSE: Deepen understanding of pragmatic choice
USER LEARNS: The STRATEGY behind phrase selection

GENERATE: Dialogue where user must explain WHY speaker chose this specific phrase

STRUCTURE:
{
    "type": "why_did_they_say",
    "content": {
        "question": "Why did [speaker] say '[phrase]' instead of something else?",
        "options": [
            "Correct pragmatic reason ✓",
            "Literal interpretation",
            "Wrong social goal",
            "Plausible but incorrect"
        ],
        "correctIndex": 0,
        "explanation": "The social/pragmatic goal achieved",
        "relatedParagraph": "The dialogue snippet for reference"
    }
}

EXAMPLE:
Dialogue: 
- Boss: "Can you stay late Friday?"
- Emma: "I'm afraid I can't. My daughter's school play is that evening."
- Boss: "No problem, enjoy the show."

Question: "Why did Emma say 'I'm afraid' instead of just 'I can't'?"
A) To soften the refusal and maintain good relationship ✓
B) She is scared of her boss
C) She wants to explain her fear of missing the play
D) It's required in formal English

LEARNING EFFECT: User understands politeness STRATEGY, not just phrase meaning
`,

    appropriateness_judgment: `
PURPOSE: Develop register sensitivity
USER LEARNS: Same phrase can be appropriate OR inappropriate depending on context

GENERATE: Same phrase used in 2-3 different contexts, user judges which is appropriate

STRUCTURE:
{
    "type": "appropriateness_judgment",
    "content": {
        "phrase": "Target phrase",
        "question": "In which situation is this phrase appropriate?",
        "options": [
            "Context where phrase fits ✓",
            "Context where phrase is too casual",
            "Context where phrase is too formal",
            "Context where meaning doesn't fit"
        ],
        "correctIndex": 0,
        "explanation": "Why register/context matters"
    }
}

EXAMPLE:
Phrase: "That's dirt cheap!"
A) Texting your friend about a sale ✓
B) Writing a product review for a business website
C) Negotiating with a vendor in a formal meeting
D) Describing antique furniture to a museum curator

LEARNING EFFECT: User develops intuition for register matching
`,

    error_detection: `
PURPOSE: Sharpen recognition of unnatural usage
USER LEARNS: Common mistakes to avoid

GENERATE: Sentence with a subtle usage error (wrong word, wrong form, wrong context)

STRUCTURE:
{
    "type": "error_detection",
    "content": {
        "sentence": "Sentence with the error",
        "wrongWord": "The incorrect word/phrase",
        "options": [
            "Correct replacement ✓",
            "Plausible but still wrong",
            "Overcorrection",
            "Different error"
        ],
        "correctIndex": 0,
        "explanation": "Why original is wrong and correction is right"
    }
}

EXAMPLE:
Sentence: "The meeting was very cheap, only 30 minutes."
What's wrong? "cheap" used for time instead of price
Correction: "brief" or "short"

LEARNING EFFECT: User avoids common mistake of using "cheap" for non-price contexts
`,

    fill_gap_mcq: `
PURPOSE: Practice recognition in context
USER LEARNS: How phrase fits into natural speech flow

GENERATE: Dialogue with blank, 3-4 options to fill

STRUCTURE:
{
    "type": "fill_gap_mcq",
    "content": {
        "dialogue": [
            {"speaker": "A", "text": "Setup line"},
            {"speaker": "B", "text": "Line with _____ blank", "isBlank": true}
        ],
        "options": ["Correct phrase ✓", "Wrong meaning", "Wrong register", "Grammatically wrong"],
        "correctIndex": 0,
        "explanation": "Why this phrase fits the flow"
    }
}
`,

    register_sorting: `
PURPOSE: Build explicit register awareness
USER LEARNS: Formality spectrum for expressing same idea

GENERATE: Same concept expressed 3 ways, user sorts by formality

STRUCTURE:
{
    "type": "register_sorting",
    "content": {
        "phrases": ["dirt cheap", "inexpensive", "reasonably priced"],
        "categories": ["Casual", "Neutral", "Formal"],
        "correctAssignment": {
            "dirt cheap": "Casual",
            "inexpensive": "Neutral", 
            "reasonably priced": "Formal"
        },
        "explanation": "How formality affects word choice"
    }
}
`,

    reading_comprehension: `
PURPOSE: Test deep understanding of phrase meaning in authentic reading context
USER LEARNS: How phrase functions within flowing text, not in isolation

GENERATE: A short passage (3-5 sentences) that uses the target phrase naturally, followed by a comprehension question about the phrase's meaning or implication IN THAT CONTEXT.

STRUCTURE:
{
    "type": "reading_comprehension",
    "content": {
        "passage": "3-5 sentence paragraph where the target phrase appears naturally",
        "targetPhrase": "the phrase being tested",
        "question": "What does [phrase] suggest in this context?",
        "options": [
            "Correct contextual meaning ✓",
            "Dictionary meaning that doesn't fit this context",
            "Sounds plausible but misreads the tone",
            "Literal interpretation"
        ],
        "correctIndex": 0,
        "explanation": "Why this meaning fits the passage context"
    }
}

EXAMPLE:
Passage: "After three rounds of grueling interviews, Mia finally received the call. 'We'd love to have you on the team,' her future manager said. Mia played it cool on the phone, but the moment she hung up, she couldn't help but break into a grin. She'd been playing it by ear for months, unsure if she'd ever land a role this good."

Question: "What does 'playing it by ear' suggest about Mia's job search?"
A) She was improvising without a fixed plan ✓
B) She was listening carefully to music
C) She was following a strict strategy
D) She was pretending to be casual

CRITICAL RULES:
- Passage must be NATURAL prose, not contrived to highlight the phrase
- Question must require understanding the phrase IN CONTEXT, not just its definition
- Include one option that is the dictionary meaning but doesn't fit the passage nuance
- Passage should have characters, setting, and emotional context
`,

    sentence_correction: `
PURPOSE: Develop native-like sensitivity to phrase misuse
USER LEARNS: Subtle ways phrases can be used incorrectly

GENERATE: A sentence where a phrase is used ALMOST correctly but with a subtle error — wrong collocate, wrong register for context, wrong preposition, or slightly off meaning. User picks the best correction.

STRUCTURE:
{
    "type": "sentence_correction",
    "content": {
        "sentence": "Sentence with subtly misused phrase",
        "underlinedPortion": "the misused part",
        "options": [
            "Best correction ✓",
            "Overcorrection (changes meaning)",
            "Still wrong (different error)",
            "No change needed"
        ],
        "correctIndex": 0,
        "explanation": "Why the original is wrong and the correction fixes it"
    }
}

EXAMPLE:
Sentence: "During the board meeting, Jake told his CEO that the new office rent was dirt cheap."
Underlined: "dirt cheap"
A) "very affordable" — better register for a formal meeting ✓
B) "super cheap" — still too casual
C) "cheap as dirt" — same register problem
D) No change needed — "dirt cheap" is fine

CRITICAL RULES:
- Error must be SUBTLE (register mismatch, wrong collocation, wrong preposition) — not obvious grammar
- Always include a "No change needed" option (sometimes the sentence IS correct)
- Explanation must teach the specific TYPE of error (register, collocation, meaning)
- At least one distractor should be a common overcorrection
`
};

/**
 * GUIDED PRODUCTION PHASE PROMPTS (Review 5-6)
 * Purpose: Bridge from recognition to production with scaffolding
 */

export const GUIDED_PRODUCTION_PROMPTS = {
    constrained_production: `
PURPOSE: First production attempts with guardrails
USER LEARNS: How to use phrase with training wheels

GENERATE: Situation + constraints + starter words

STRUCTURE:
{
    "type": "constrained_production",
    "content": {
        "targetPhrase": "I'm afraid",
        "prompt": "Decline this invitation politely",
        "context": "Your coworker asks if you can cover their Saturday shift.",
        "hint": "Use 'I'm afraid' to soften your response",
        "rubric": {
            "phrase_used": true,
            "natural_flow": true,
            "context_appropriate": true
        }
    }
}

EXAMPLE:
Situation: "Your supervisor asks if you can present at the 8am Monday meeting."
Constraints: Use "I'm afraid" + give a brief reason
Starter: "I'm afraid I..."

LEARNING EFFECT: User practices production with safety net
`,

    transformation_exercise: `
PURPOSE: Teach register flexibility
USER LEARNS: Same meaning can be expressed at different formality levels

GENERATE: Sentence in one register, user selects the best translation into the target register

STRUCTURE:
{
    "type": "transformation_exercise",
    "content": {
        "originalPhrase": "That's dirt cheap!",
        "originalRegister": "casual",
        "targetRegister": "formal",
        "prompt": "Rewrite this for a business email",
        "hint": "Keep the meaning of 'surprisingly low price'",
        "options": [
            "The pricing is quite competitive ✓",
            "This represents an okay price",
            "The expense is very small",
            "It is extremely inexpensive"
        ],
        "correctIndex": 0
    }
}
`,

    dialogue_completion_open: `
PURPOSE: Production in dialogue flow
USER LEARNS: How phrase fits conversational rhythm

GENERATE: Dialogue with open-ended blank

STRUCTURE:
{
    "type": "dialogue_completion_open",
    "content": {
        "context": "At a networking event, talking to a new contact",
        "dialogueBefore": "Person: 'So, what brings you here tonight?'\\nYou: [Awkward pause] '...'",
        "targetPhrase": "break the ice",
        "hint": "Start a casual conversation to ease the tension",
        "rubric": {
            "phrase_used": true,
            "natural_flow": true,
            "context_appropriate": true
        }
    }
}
`,

    text_completion: `
PURPOSE: Test active recall and contextual reasoning simultaneously
USER LEARNS: How multiple phrases work together in flowing text

GENERATE: A paragraph (4-6 sentences) with 2 blanks ([BLANK_1] and [BLANK_2]) where target phrases should go. Provide a word bank of 5-6 options (2 correct + 3-4 distractors).

STRUCTURE:
{
    "type": "text_completion",
    "content": {
        "paragraph": "Text with [BLANK_1] and [BLANK_2] placeholders",
        "blanks": [
            { "id": "BLANK_1", "correctAnswer": "correct phrase for blank 1" },
            { "id": "BLANK_2", "correctAnswer": "correct phrase for blank 2" }
        ],
        "wordBank": ["correct1", "correct2", "distractor1", "distractor2", "distractor3"],
        "explanation": "Why each phrase fits its blank"
    }
}

EXAMPLE:
Paragraph: "When Maya arrived at the startup's first team dinner, nobody was talking. She decided to [BLANK_1] by sharing a funny story about her commute. By the end of the evening, the conversation was flowing so naturally that their manager said the team had really [BLANK_2] together."

Blanks: BLANK_1 = "break the ice", BLANK_2 = "hit it off"
Word Bank: ["break the ice", "hit it off", "cut corners", "pull strings", "go the extra mile"]

CRITICAL RULES:
- Paragraph must read naturally, not like a fill-in-the-blank worksheet
- Distractors must be real phrases (not nonsense) that DON'T fit the context
- Each blank should test a DIFFERENT phrase
- Word bank should contain 5-6 options minimum
`
};

/**
 * MASTERY PHASE PROMPTS (Review 7+)
 * Purpose: Free authentic production proving acquisition
 */

export const MASTERY_PROMPTS = {
    scenario_production: `
PURPOSE: Full authentic production in realistic context
USER LEARNS: True mastery = using phrase without thinking about it

GENERATE: Complete scenario requiring natural phrase use

STRUCTURE:
{
    "type": "scenario_production",
    "content": {
        "scenario": "You're at a networking event. Someone you've never met looks uncomfortable standing alone near the refreshments. Your goal: start a conversation and make them feel welcome.",
        "targetPhrase": "break the ice",
        "evaluationCriteria": {
            "phrase_present": true,
            "natural_use": "4-tier rubric",
            "context_appropriate": true,
            "social_awareness": true
        }
    }
}

EVALUATION: Use 4-tier naturalness rubric from System Design.md
- NATURAL: Phrase emerges organically
- ACCEPTABLE: Correct but slightly stiff  
- FORCED: Present but awkwardly inserted
- INCORRECT: Wrong usage or meaning
`,

    multiple_response_generation: `
PURPOSE: Demonstrate flexibility and depth of understanding
USER LEARNS: There are multiple natural ways to use this phrase

GENERATE: Situation where phrase applies, ask for 2+ valid responses

STRUCTURE:
{
    "type": "multiple_response_generation",
    "content": {
        "context": "Your friend asks what you thought of the restaurant's prices.",
        "targetPhrase": "dirt cheap",
        "requiredCount": 2,
        "hint": "Express excitement about the unexpectedly low prices in different ways"
    }
}

EXAMPLE VALID RESPONSES:
1. "OMG, it was dirt cheap! Like $15 for a full meal!"
2. "So dirt cheap, I couldn't believe it. We have to go back."
`,

    explain_to_friend: `
PURPOSE: Consolidate understanding through teaching
USER LEARNS: Teaching forces deeper processing and reveals gaps

GENERATE: Request to explain phrase to hypothetical learner

STRUCTURE:
{
    "type": "explain_to_friend",
    "content": {
        "setup": "Your friend who's learning English says: 'I heard someone say this apartment is dirt cheap. What does that mean? When would I use it?'",
        "targetPhrase": "dirt cheap",
        "requirements": [
            "Explain the meaning",
            "Give an example situation",
            "Mention when NOT to use it"
        ]
    }
}

EXPECTED ELEMENTS:
- Meaning: Very cheap, surprisingly low price
- Example: "When you find a great deal and want to show excitement"
- Caveat: "Don't use in formal situations or about quality"
`,

    creative_context_use: `
PURPOSE: True generative ability
USER LEARNS: Can create novel contexts for phrase use

GENERATE: Open prompt for user to invent their own scenario

STRUCTURE:
{
    "type": "creative_context_use",
    "content": {
        "targetPhrase": "break the ice",
        "prompt": "Create a situation where you would naturally use this phrase. Describe the setting, who's there, and what happens.",
        "constraints": ["Must be a realistic scenario", "Phrase must fit naturally"]
    }
}

EVALUATION:
- Is the scenario plausible?
- Would the phrase actually be used there?
- Does it show understanding of phrase nuance?
`
};

/**
 * Build complete prompt for a question type
 */
export function getQuestionPrompt(
    type: ExerciseQuestionType,
    phrase: { phrase: string; meaning: string; register?: string },
    context: { theme: string; setting?: string; relationship?: string }
): string {
    const prompts: Record<string, string> = {
        ...RECOGNITION_PROMPTS,
        ...COMPREHENSION_PROMPTS,
        ...GUIDED_PRODUCTION_PROMPTS,
        ...MASTERY_PROMPTS,
    };

    const basePrompt = prompts[type];
    if (!basePrompt) {
        return ''; // Story/listening types handled separately
    }

    return `${basePrompt}

TARGET PHRASE: "${phrase.phrase}"
MEANING: ${phrase.meaning}
REGISTER: ${phrase.register || 'neutral'}

CONTEXT:
- Theme: ${context.theme}
- Setting: ${context.setting || 'general'}
- Relationship: ${context.relationship || 'peers'}

Generate ONE question of type "${type}" following the structure above.
Return valid JSON only.`;
}
