/**
 * Speaking Analysis using Gemini 2.5 Flash Lite
 * 
 * Analyzes user audio for:
 * - Phrase usage
 * - Intonation patterns
 * - Language fit
 * - Improvement suggestions
 */

import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from './api-key-rotation';

// Types for analysis results
export interface PhraseResult {
    phraseId: string;
    phrase: string;
    used: boolean;
    usedCorrectly: boolean;
    note?: string;
}

export interface IntonationData {
    words: string[];
    expectedPattern: number[];  // 0-1 scale (0=falling, 1=rising)
    userPattern: number[];
    keyMoments: Array<{
        word: string;
        wordIndex: number;
        expected: 'rising' | 'falling' | 'flat';
        actual: 'rising' | 'falling' | 'flat';
        correct: boolean;
    }>;
}

export interface LanguageFit {
    score: number;  // 1-10
    registerMatch: boolean;
    situationFit: 'appropriate' | 'slightly_off' | 'inappropriate';
    feedback: string;
}

export interface SpeakingFeedback {
    phrases: PhraseResult[];
    intonation: IntonationData;
    languageFit: LanguageFit;
    suggestions: string[];
    overallFeedback: string;
    encouragement: string;
    fluency: 'natural' | 'hesitant' | 'choppy';
    transcript: string;
}

export interface AnalysisRequest {
    audioBase64: string;
    mimeType: string;
    questionText: string;
    questionContext?: string;
    targetPhrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
    }>;
}

/**
 * Analyze user's spoken response using Gemini 2.5 Flash Lite
 */
export async function analyzeSpeakingResponse(
    request: AnalysisRequest
): Promise<SpeakingFeedback> {
    const apiKey = getNextApiKey();
    if (!apiKey) {
        throw new Error('No API key available');
    }

    const ai = new GoogleGenAI({ apiKey });

    // System Design.md prompt (lines 1463-1600+)
    const prompt = `You are a pronunciation coach who evaluates spoken English for NATURALNESS, not just correctness.

CONTEXT:
Question asked: "${request.questionText}"
${request.questionContext ? `Situation: ${request.questionContext}` : ''}

TARGET PHRASES TO USE:
${request.targetPhrases.map((p, i) => `${i + 1}. "${p.phrase}" - meaning: ${p.meaning}`).join('\n')}

ANALYZE THE AUDIO AND PROVIDE:

1. **TRANSCRIPTION** (What they said)
   - Transcribe exactly, including:
     * Filled pauses: "um", "uh", "like"
     * False starts: "I was... I mean..."
     * These are GOOD signs of natural speech!

2. **PHRASE USAGE EVALUATION** (STRICT 4-TIER NATURALNESS CHECK)
   
   For each target phrase:
   
   **NATURAL (100%)**: Exactly how a native speaker would say it
   - Perfect flow and rhythm
   - Appropriate register for context
   - Would say it exactly this way
   
   **ACCEPTABLE (75-90%)**: Grammatically perfect but slightly stiff
   - Grammar is correct
   - Meaning is right
   - Sounds slightly textbook/formal
   - Missing natural contractions or flow
   
   **FORCED (40-70%)**: Phrase appears but awkwardly inserted
   - Positioned unnaturally in sentence
   - Sounds like trying to use a phrase
   - Self-conscious or over-explained
   
   **INCORRECT (0-30%)**: Wrong meaning, grammar, or context
   
   **NOT_USED**: Phrase not present
   
   ONLY "NATURAL" and "ACCEPTABLE" count as successful usage.

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
   
   D) Flag key intonation moments for feedback

4. **PRAGMATIC FIT** (Score 1-10)
   - Does response fit the question/situation?
   - Is register appropriate for context?
   - Does tone match intent?

5. **FLUENCY ASSESSMENT**
   - "natural" = sounds like native speaker (some hesitations OK!)
   - "hesitant" = many pauses, searching for words
   - "choppy" = word-by-word, no flow
   
   Note: "Um" and "like" are NORMAL - don't penalize!

6. **ACTIONABLE SUGGESTIONS** (2-3 max)
   - ONE intonation improvement (specific phrase)
   - ONE pragmatic adjustment (register/tone)
   - ONE fluency tip

7. **WARM ENCOURAGEMENT** (End on positive note)
   - Highlight what sounded genuinely native
   - Growth-focused, not critical

Respond ONLY in this exact JSON format:
{
  "transcript": "what the user said (include ums, pauses)",
  "phrases": [
    { 
      "phraseId": "id", 
      "phrase": "the phrase", 
      "used": true, 
      "tier": "NATURAL|ACCEPTABLE|FORCED|INCORRECT|NOT_USED",
      "usedCorrectly": true, 
      "note": "why this tier" 
    }
  ],
  "intonation": {
    "words": ["I", "think", "that", "..."],
    "expectedPattern": [0.4, 0.5, 0.3],
    "userPattern": [0.3, 0.6, 0.4],
    "keyMoments": [
      { "word": "please", "wordIndex": 5, "expected": "rising", "actual": "falling", "correct": false }
    ]
  },
  "languageFit": {
    "score": 8,
    "registerMatch": true,
    "situationFit": "appropriate",
    "feedback": "Good casual tone for this informal situation"
  },
  "fluency": "natural",
  "suggestions": ["Try emphasizing...", "Consider starting with..."],
  "overallFeedback": "You expressed your idea clearly...",
  "encouragement": "Great job using 'cut corners' naturally!"
}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
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
                maxOutputTokens: 2000
            }
        });

        const text = response.text || '';

        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and normalize the response
        return normalizeFeedback(parsed, request.targetPhrases);

    } catch (error) {
        console.error('[Speaking Analysis] Error:', error);
        // Return fallback feedback
        return createFallbackFeedback(request.targetPhrases);
    }
}

/**
 * Normalize and validate the Gemini response
 */
function normalizeFeedback(
    parsed: any,
    targetPhrases: Array<{ id: string; phrase: string; meaning: string }>
): SpeakingFeedback {
    // Ensure phrases array has all target phrases
    const phrases: PhraseResult[] = targetPhrases.map(tp => {
        const found = parsed.phrases?.find(
            (p: any) => p.phraseId === tp.id || p.phrase?.toLowerCase() === tp.phrase.toLowerCase()
        );
        return {
            phraseId: tp.id,
            phrase: tp.phrase,
            used: found?.used ?? false,
            usedCorrectly: found?.usedCorrectly ?? false,
            note: found?.note
        };
    });

    // Normalize intonation
    const intonation: IntonationData = {
        words: parsed.intonation?.words || [],
        expectedPattern: parsed.intonation?.expectedPattern || [],
        userPattern: parsed.intonation?.userPattern || [],
        keyMoments: (parsed.intonation?.keyMoments || []).map((km: any) => ({
            word: km.word || '',
            wordIndex: km.wordIndex || 0,
            expected: km.expected || 'flat',
            actual: km.actual || 'flat',
            correct: km.correct ?? false
        }))
    };

    // Normalize language fit
    const languageFit: LanguageFit = {
        score: Math.min(10, Math.max(1, parsed.languageFit?.score || 5)),
        registerMatch: parsed.languageFit?.registerMatch ?? true,
        situationFit: parsed.languageFit?.situationFit || 'appropriate',
        feedback: parsed.languageFit?.feedback || ''
    };

    return {
        phrases,
        intonation,
        languageFit,
        suggestions: parsed.suggestions || [],
        overallFeedback: parsed.overallFeedback || 'Good effort!',
        encouragement: parsed.encouragement || 'Keep practicing!',
        fluency: parsed.fluency || 'natural',
        transcript: parsed.transcript || ''
    };
}

/**
 * Create fallback feedback when analysis fails
 */
function createFallbackFeedback(
    targetPhrases: Array<{ id: string; phrase: string; meaning: string }>
): SpeakingFeedback {
    return {
        phrases: targetPhrases.map(p => ({
            phraseId: p.id,
            phrase: p.phrase,
            used: false,
            usedCorrectly: false
        })),
        intonation: {
            words: [],
            expectedPattern: [],
            userPattern: [],
            keyMoments: []
        },
        languageFit: {
            score: 5,
            registerMatch: true,
            situationFit: 'appropriate',
            feedback: 'Unable to analyze language fit'
        },
        suggestions: ['Try speaking a bit more clearly', 'Make sure your microphone is working well'],
        overallFeedback: 'We had trouble analyzing your response. Please try again.',
        encouragement: 'Keep practicing!',
        fluency: 'natural',
        transcript: ''
    };
}
