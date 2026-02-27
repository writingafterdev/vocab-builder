import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from './api-key-rotation';

/**
 * Smart Phrase Detection using Gemini 2.5 Flash Lite
 * 
 * Detects when users have correctly used target phrases in their responses,
 * handling variations like:
 * - Tense changes: "cut corners" → "cutting corners", "cut corners"
 * - Context adaptations: "bear in mind" → "I'll bear that in mind"
 * - Paraphrasing that demonstrates understanding
 */

interface PhraseDetectionResult {
    phraseId: string;
    phrase: string;
    detected: boolean;
    usedForm?: string; // The actual form used by the user
    confidence: 'high' | 'medium' | 'low';
}

interface DetectionRequest {
    userResponse: string;
    targetPhrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
    }>;
}

/**
 * Detect which target phrases were correctly used in the user's response
 * Uses Gemini 2.5 Flash Lite for fast, cost-effective analysis
 */
export async function detectPhrasesUsed(
    request: DetectionRequest
): Promise<PhraseDetectionResult[]> {
    const { userResponse, targetPhrases } = request;

    if (!userResponse.trim() || targetPhrases.length === 0) {
        return targetPhrases.map(p => ({
            phraseId: p.id,
            phrase: p.phrase,
            detected: false,
            confidence: 'high' as const
        }));
    }

    // Quick check: exact match first (case-insensitive)
    const quickResults = targetPhrases.map(p => {
        const lowerResponse = userResponse.toLowerCase();
        const lowerPhrase = p.phrase.toLowerCase();

        if (lowerResponse.includes(lowerPhrase)) {
            return {
                phraseId: p.id,
                phrase: p.phrase,
                detected: true,
                usedForm: p.phrase,
                confidence: 'high' as const
            };
        }
        return null;
    });

    // Filter out exact matches
    const exactMatches = quickResults.filter(r => r !== null) as PhraseDetectionResult[];
    const needsAnalysis = targetPhrases.filter(
        p => !exactMatches.find(m => m.phraseId === p.id)
    );

    if (needsAnalysis.length === 0) {
        return exactMatches;
    }

    // Use Gemini for fuzzy matching of remaining phrases
    try {
        const apiKey = getNextApiKey();
        if (!apiKey) {
            throw new Error('No API key available');
        }
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `You are a native English speaker checking if someone used phrases NATURALLY.

TARGET PHRASES:
${needsAnalysis.map((p, i) => `${i + 1}. "${p.phrase}" - ${p.meaning}`).join('\n')}

USER'S RESPONSE:
"${userResponse}"

YOUR TASK: For each phrase, determine if they used it NATURALLY (not just correctly).

## SCORING GUIDE

- **NATURAL**: Perfect usage. You'd say it exactly this way.
- **ACCEPTABLE**: Correct but slightly stiff/textbook-ish
- **FORCED**: Grammatically crammed in, doesn't flow
- **INCORRECT**: Wrong meaning, grammar, or context
- **NOT_USED**: Phrase not present

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

## RESPOND IN JSON:
{
    "detections": [
        {
            "phraseIndex": 0,
            "detected": true/false,
            "usedForm": "exact words they used" or null,
            "confidence": "high"/"medium"/"low",
            "naturalness": "NATURAL"/"ACCEPTABLE"/"FORCED"/"INCORRECT",
            "nativeAlternative": "how a native would say it better" or null
        }
    ]
}

Rules:
- "high" confidence + "NATURAL/ACCEPTABLE" = detected successfully
- "FORCED" = detected but doesn't count as good usage
- Be strict on naturalness - grammar isn't enough`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
            config: {
                temperature: 0.1,
                maxOutputTokens: 500
            }
        });

        const text = response.text || '';

        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[Phrase Detection] No JSON in response');
            return [...exactMatches, ...needsAnalysis.map(p => ({
                phraseId: p.id,
                phrase: p.phrase,
                detected: false,
                confidence: 'low' as const
            }))];
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
            detections: Array<{
                phraseIndex: number;
                detected: boolean;
                usedForm: string | null;
                confidence: 'high' | 'medium' | 'low';
            }>;
        };

        // Map back to results
        const aiResults: PhraseDetectionResult[] = needsAnalysis.map((p, idx) => {
            const detection = parsed.detections.find(d => d.phraseIndex === idx);
            return {
                phraseId: p.id,
                phrase: p.phrase,
                detected: detection?.detected ?? false,
                usedForm: detection?.usedForm || undefined,
                confidence: detection?.confidence ?? 'low'
            };
        });

        return [...exactMatches, ...aiResults];

    } catch (error) {
        console.error('[Phrase Detection] AI error:', error);
        // Fallback: return exact matches only
        return [...exactMatches, ...needsAnalysis.map(p => ({
            phraseId: p.id,
            phrase: p.phrase,
            detected: false,
            confidence: 'low' as const
        }))];
    }
}

/**
 * Get IDs of phrases that were successfully used
 * Filters to only high/medium confidence detections
 */
export function getUsedPhraseIds(results: PhraseDetectionResult[]): string[] {
    return results
        .filter(r => r.detected && (r.confidence === 'high' || r.confidence === 'medium'))
        .map(r => r.phraseId);
}

/**
 * Simple boolean check if any phrases were used
 */
export function anyPhrasesUsed(results: PhraseDetectionResult[]): boolean {
    return results.some(r => r.detected && (r.confidence === 'high' || r.confidence === 'medium'));
}
