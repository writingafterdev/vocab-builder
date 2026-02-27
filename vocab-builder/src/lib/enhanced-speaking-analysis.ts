/**
 * Enhanced Speaking Analysis using Gemini
 * 
 * Comprehensive analysis including:
 * - Detailed vocabulary feedback (register, nuance, pragmatics, collocation)
 * - Speaking skills (pronunciation, fluency, grammar, connected speech)
 * - Intonation patterns
 * - Error extraction for Daily Drill
 */

import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from './api-key-rotation';
import {
    SpeakingAnalysisResult,
    VocabDetailedFeedback,
    SkillScore,
    FluencyScore,
    GrammarScore,
    ConnectedSpeechScore,
    IntonationData,
    AnnotatedWord,
    RegisterLevel
} from './speaking-feedback';

// ============================================
// Request Interface
// ============================================

export interface EnhancedAnalysisRequest {
    audioBase64: string;
    mimeType: string;
    questionText: string;
    questionContext?: string;
    targetPhrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
        register?: RegisterLevel;
    }>;
    situationContext?: {
        setting: string;        // "business meeting", "casual chat"
        relationship: string;   // "boss", "friend", "stranger"
        formality: 'formal' | 'neutral' | 'casual';
    };
}

// ============================================
// Analysis Function
// ============================================

export async function analyzeEnhancedSpeaking(
    request: EnhancedAnalysisRequest
): Promise<SpeakingAnalysisResult> {
    const apiKey = getNextApiKey();
    if (!apiKey) {
        throw new Error('No API key available');
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = buildEnhancedPrompt(request);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite-preview-06-17',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: request.mimeType,
                                data: request.audioBase64
                            }
                        }
                    ]
                }
            ],
            config: {
                temperature: 0.3,
                maxOutputTokens: 4000
            }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('No valid JSON in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return normalizeEnhancedResult(parsed, request.targetPhrases);

    } catch (error) {
        console.error('[Enhanced Speaking Analysis] Error:', error);
        return createFallbackResult(request.targetPhrases);
    }
}

// ============================================
// Prompt Builder
// ============================================

function buildEnhancedPrompt(request: EnhancedAnalysisRequest): string {
    const phrasesList = request.targetPhrases.map((p, i) =>
        `${i + 1}. "${p.phrase}" (${p.register || 'neutral'}) - ${p.meaning}`
    ).join('\n');

    const situation = request.situationContext
        ? `Setting: ${request.situationContext.setting}
Relationship: ${request.situationContext.relationship}
Formality: ${request.situationContext.formality}`
        : 'General conversation';

    return `You are an expert English language coach. Analyze this spoken response for a vocabulary practice exercise.

CONTEXT:
Question: "${request.questionText}"
${request.questionContext ? `Context: ${request.questionContext}` : ''}

SITUATION:
${situation}

TARGET PHRASES TO USE:
${phrasesList}

ANALYZE THE AUDIO AND PROVIDE COMPREHENSIVE FEEDBACK:

1. TRANSCRIPT: What the user said verbatim.

2. OVERALL SCORE (0-100): Based on vocabulary usage, accuracy, and naturalness.

3. VOCABULARY FEEDBACK (DETAILED - for each target phrase):
   For each phrase provide:
   a) used: boolean - Did they use it?
   b) status: "perfect" | "good" | "issues" | "not_used"
   c) register:
      - status: "match" | "mismatch" | "na"
      - expected: the expected register for this situation
      - actual: the register the user used
      - explanation: Detailed explanation of why it matches or doesn't. If mismatch, explain why the phrase is inappropriate for this context.
      - alternative: If mismatch, suggest a better phrase
   d) nuance:
      - score: 1 (wrong meaning), 2 (acceptable), or 3 (perfect)
      - explanation: Does the phrase's connotation fit? Explain what the phrase implies and whether user captured that nuance.
      - betterFit: If score < 3, suggest a phrase that better fits
   e) pragmatics:
      - appropriate: boolean
      - context: Describe the social context
      - issue: If inappropriate, explain the social/cultural problem
      - suggestion: How to express this more appropriately
   f) collocation:
      - correct: boolean
      - expected: The natural word combination
      - actual: What user said (if incorrect)
      - explanation: Why this collocation is unnatural
   g) encouragement: If perfect usage, a warm positive note

4. SPEAKING SKILLS:
   a) pronunciation:
      - score: 0-100
      - issues: Array of {word, issue, correction}
   b) fluency:
      - score: 0-100
      - speechRate: estimated WPM
      - pauseCount: number of unnatural pauses
      - fillers: array of filler words used
   c) grammar:
      - score: 0-100
      - errors: Array of {original, correction, rule}
   d) connectedSpeech:
      - score: 0-100
      - patterns: Array of {type: "linking"|"elision"|"assimilation"|"weak_form"|"intrusion", expected, actual, correct}

5. INTONATION:
   - words: Array of main words from speech
   - expectedPattern: Array of pitch values (0.0 = falling, 1.0 = rising)
   - userPattern: Array of user's actual pitch values

6. ANNOTATED WORDS: Array of {text, status: "correct"|"pronunciation"|"grammar"|"collocation", annotation?}

7. INSIGHTS:
   - strength: One thing they did really well
   - tip: One actionable improvement tip
   - focusArea: The main area to practice

Respond ONLY in this exact JSON format:
{
  "transcript": "...",
  "overallScore": 82,
  "vocabularyFeedback": [
    {
      "phraseId": "id",
      "phrase": "the phrase",
      "used": true,
      "status": "issues",
      "register": {
        "status": "mismatch",
        "expected": "formal",
        "actual": "casual",
        "explanation": "This phrase is too casual for a business meeting...",
        "alternative": "Let me get straight to the point"
      },
      "nuance": {
        "score": 2,
        "explanation": "Close but this phrase implies reluctance rather than hesitation...",
        "betterFit": "dragging their feet"
      },
      "pragmatics": {
        "appropriate": false,
        "context": "Speaking to a supervisor about a colleague",
        "issue": "This sounds accusatory",
        "suggestion": "They seem to be taking their time"
      },
      "collocation": {
        "correct": true
      },
      "encouragement": null
    }
  ],
  "skills": {
    "pronunciation": { "score": 85, "issues": [...] },
    "fluency": { "score": 90, "speechRate": 125, "pauseCount": 2, "fillers": ["um"] },
    "grammar": { "score": 80, "errors": [...] },
    "connectedSpeech": { "score": 75, "patterns": [...] }
  },
  "intonation": {
    "words": ["I", "think", "..."],
    "expectedPattern": [0.4, 0.5, ...],
    "userPattern": [0.3, 0.6, ...]
  },
  "annotatedWords": [
    { "text": "I", "status": "correct" },
    { "text": "think", "status": "pronunciation", "annotation": "th→f" }
  ],
  "insights": {
    "strength": "Great vocabulary usage",
    "tip": "Work on 'th' sounds",
    "focusArea": "pronunciation"
  }
}`;
}

// ============================================
// Normalization
// ============================================

function normalizeEnhancedResult(
    parsed: any,
    targetPhrases: Array<{ id: string; phrase: string; meaning: string; register?: RegisterLevel }>
): SpeakingAnalysisResult {

    // Vocabulary feedback
    const vocabularyFeedback: VocabDetailedFeedback[] = targetPhrases.map(tp => {
        const found = parsed.vocabularyFeedback?.find(
            (vf: any) => vf.phraseId === tp.id ||
                vf.phrase?.toLowerCase() === tp.phrase.toLowerCase()
        );

        if (!found) {
            return {
                phraseId: tp.id,
                phrase: tp.phrase,
                used: false,
                status: 'not_used' as const,
                register: {
                    status: 'na' as const,
                    expected: (tp.register || 'neutral') as RegisterLevel,
                    actual: 'neutral' as RegisterLevel,
                    explanation: ''
                },
                nuance: { score: 1 as const, explanation: 'Phrase not used' },
                pragmatics: { appropriate: true, context: '' },
                collocation: { correct: true }
            };
        }

        return {
            phraseId: tp.id,
            phrase: tp.phrase,
            used: found.used ?? false,
            status: found.status || 'not_used',
            register: {
                status: found.register?.status || 'na',
                expected: found.register?.expected || 'neutral',
                actual: found.register?.actual || 'neutral',
                explanation: found.register?.explanation || '',
                alternative: found.register?.alternative
            },
            nuance: {
                score: found.nuance?.score || 2,
                explanation: found.nuance?.explanation || '',
                betterFit: found.nuance?.betterFit
            },
            pragmatics: {
                appropriate: found.pragmatics?.appropriate ?? true,
                context: found.pragmatics?.context || '',
                issue: found.pragmatics?.issue,
                suggestion: found.pragmatics?.suggestion
            },
            collocation: {
                correct: found.collocation?.correct ?? true,
                expected: found.collocation?.expected,
                actual: found.collocation?.actual,
                explanation: found.collocation?.explanation
            },
            encouragement: found.encouragement
        };
    });

    // Skills
    const skills = {
        pronunciation: normalizeSkillScore(parsed.skills?.pronunciation),
        fluency: normalizeFluencyScore(parsed.skills?.fluency),
        vocabulary: calculateVocabScore(vocabularyFeedback),
        grammar: normalizeGrammarScore(parsed.skills?.grammar),
        connectedSpeech: normalizeConnectedSpeech(parsed.skills?.connectedSpeech)
    };

    // Intonation
    const intonation: IntonationData = {
        words: parsed.intonation?.words || [],
        expectedPattern: parsed.intonation?.expectedPattern || [],
        userPattern: parsed.intonation?.userPattern || []
    };

    // Annotated words
    const annotatedWords: AnnotatedWord[] = (parsed.annotatedWords || []).map((aw: any) => ({
        text: aw.text || '',
        status: aw.status || 'correct',
        annotation: aw.annotation
    }));

    return {
        overallScore: parsed.overallScore || 50,
        transcript: parsed.transcript || '',
        skills,
        vocabularyFeedback,
        intonation,
        annotatedWords,
        insights: {
            strength: parsed.insights?.strength || 'Good effort!',
            tip: parsed.insights?.tip || 'Keep practicing',
            focusArea: parsed.insights?.focusArea || 'vocabulary'
        }
    };
}

// ============================================
// Helper Functions
// ============================================

function normalizeSkillScore(skill: any): SkillScore {
    return {
        score: skill?.score || 70,
        issues: (skill?.issues || []).map((i: any) => ({
            word: i.word || '',
            issue: i.issue || '',
            correction: i.correction || ''
        }))
    };
}

function normalizeFluencyScore(fluency: any): FluencyScore {
    return {
        score: fluency?.score || 70,
        speechRate: fluency?.speechRate || 120,
        pauseCount: fluency?.pauseCount || 0,
        fillers: fluency?.fillers || []
    };
}

function normalizeGrammarScore(grammar: any): GrammarScore {
    return {
        score: grammar?.score || 70,
        errors: (grammar?.errors || []).map((e: any) => ({
            original: e.original || '',
            correction: e.correction || '',
            rule: e.rule || ''
        }))
    };
}

function normalizeConnectedSpeech(speech: any): ConnectedSpeechScore {
    return {
        score: speech?.score || 70,
        patterns: (speech?.patterns || []).map((p: any) => ({
            type: p.type || 'linking',
            expected: p.expected || '',
            actual: p.actual || '',
            correct: p.correct ?? true
        }))
    };
}

function calculateVocabScore(feedback: VocabDetailedFeedback[]): number {
    if (feedback.length === 0) return 50;

    let total = 0;
    feedback.forEach(vf => {
        if (vf.status === 'perfect') total += 100;
        else if (vf.status === 'good') total += 80;
        else if (vf.status === 'issues') total += 50;
        else total += 0;
    });

    return Math.round(total / feedback.length);
}

// ============================================
// Fallback
// ============================================

function createFallbackResult(
    targetPhrases: Array<{ id: string; phrase: string; meaning: string; register?: RegisterLevel }>
): SpeakingAnalysisResult {
    return {
        overallScore: 50,
        transcript: '',
        skills: {
            pronunciation: { score: 50, issues: [] },
            fluency: { score: 50, speechRate: 100, pauseCount: 0, fillers: [] },
            vocabulary: 50,
            grammar: { score: 50, errors: [] },
            connectedSpeech: { score: 50, patterns: [] }
        },
        vocabularyFeedback: targetPhrases.map(p => ({
            phraseId: p.id,
            phrase: p.phrase,
            used: false,
            status: 'not_used' as const,
            register: {
                status: 'na' as const,
                expected: (p.register || 'neutral') as RegisterLevel,
                actual: 'neutral' as RegisterLevel,
                explanation: ''
            },
            nuance: { score: 1 as const, explanation: 'Could not analyze' },
            pragmatics: { appropriate: true, context: '' },
            collocation: { correct: true }
        })),
        intonation: { words: [], expectedPattern: [], userPattern: [] },
        annotatedWords: [],
        insights: {
            strength: 'Keep practicing!',
            tip: 'Try speaking more clearly',
            focusArea: 'general'
        }
    };
}
