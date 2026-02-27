/**
 * Placement Test - Speaking-based proficiency assessment
 * 
 * 4 speaking tasks that evaluate:
 * - Pronunciation
 * - Vocabulary breadth/depth
 * - Fluency
 * - Sentence complexity
 */

export interface PlacementTask {
    id: string;
    type: 'read_aloud' | 'opinion' | 'situation' | 'word_association';
    title: string;
    prompt: string;
    expectedDuration: number;    // seconds
    evaluationCriteria: string[];
}

export interface TaskResponse {
    taskId: string;
    audioBase64: string;
    mimeType: string;
    duration: number;
}

export interface PlacementResult {
    // Scores (0-100)
    pronunciation: number;
    vocabulary: number;
    fluency: number;
    complexity: number;

    // Final level
    lexileLevel: number;         // 200-1600
    proficiencyLabel: string;    // e.g., "Intermediate"

    // Feedback
    feedback: string;
    strengths: string[];
    areasToImprove: string[];
}

/**
 * The 4 placement test tasks
 */
export const PLACEMENT_TASKS: PlacementTask[] = [
    {
        id: 'read_aloud',
        type: 'read_aloud',
        title: 'Read Aloud',
        prompt: `Please read the following passage aloud clearly:

"The new coffee shop on the corner has become incredibly popular. Despite opening just last month, there's always a line out the door during the morning rush. Many people say it's because of their unique blend of locally roasted beans."`,
        expectedDuration: 20,
        evaluationCriteria: ['pronunciation', 'stress patterns', 'rhythm', 'clarity']
    },
    {
        id: 'opinion',
        type: 'opinion',
        title: 'Share Your Opinion',
        prompt: 'What is your favorite way to spend a weekend? Explain why you enjoy it.',
        expectedDuration: 30,
        evaluationCriteria: ['coherence', 'vocabulary range', 'sentence complexity', 'fluency']
    },
    {
        id: 'situation',
        type: 'situation',
        title: 'Respond to a Situation',
        prompt: `Imagine this situation:

You ordered food at a restaurant, but the waiter brought the wrong dish. 

What would you say to the waiter? Speak naturally as if you're really there.`,
        expectedDuration: 25,
        evaluationCriteria: ['pragmatics', 'register appropriateness', 'politeness', 'clarity']
    },
    {
        id: 'word_association',
        type: 'word_association',
        title: 'Word Association',
        prompt: `In about 20 seconds, name as many words related to "TRAVEL" as you can.

For example: airplane, passport, hotel...

Go!`,
        expectedDuration: 20,
        evaluationCriteria: ['vocabulary depth', 'word retrieval speed', 'variety']
    }
];

/**
 * Calculate final level from component scores
 */
export function calculateLevelFromScores(
    pronunciation: number,
    vocabulary: number,
    fluency: number,
    complexity: number
): number {
    // Weighted average
    const weighted =
        (pronunciation * 0.30) +  // 30%
        (vocabulary * 0.30) +     // 30%
        (fluency * 0.25) +        // 25%
        (complexity * 0.15);      // 15%

    // Scale 0-100 to 200-1600
    const level = 200 + (weighted / 100) * 1400;

    return Math.round(level);
}

/**
 * Build the Gemini prompt for proficiency analysis
 */
export function buildAnalysisPrompt(taskCount: number): string {
    return `You are an English proficiency assessor. Analyze these ${taskCount} speaking samples from a placement test.

TASKS:
1. READ ALOUD: User reads a passage (evaluate pronunciation, stress, rhythm)
2. OPINION: User shares their opinion on a topic (evaluate vocabulary, coherence)
3. SITUATION: User responds to a social situation (evaluate pragmatics, appropriateness)
4. WORD ASSOCIATION: User lists words related to "TRAVEL" (evaluate vocabulary depth)

For each dimension, score 0-100:

1. PRONUNCIATION (30%): Clarity, stress patterns, intelligibility, natural rhythm
2. VOCABULARY (30%): Range, appropriateness, depth, word choice quality
3. FLUENCY (25%): Natural flow, minimal hesitations, self-correction ability
4. COMPLEXITY (15%): Sentence structure variety, grammar accuracy, idea organization

Also provide:
- Overall feedback (2-3 sentences summarizing their level)
- Top 2 strengths (brief phrases)
- Top 2 areas to improve (brief phrases)

Respond ONLY in this exact JSON format:
{
  "pronunciation": 75,
  "vocabulary": 68,
  "fluency": 80,
  "complexity": 62,
  "feedback": "You demonstrate solid intermediate proficiency with good fluency...",
  "strengths": ["Clear pronunciation", "Natural speaking rhythm"],
  "areasToImprove": ["Expand vocabulary range", "Vary sentence structures"]
}`;
}
