import { NextRequest, NextResponse } from 'next/server';
import { getDocument, setDocument, updateDocument, serverTimestamp } from '@/lib/firestore-rest';
import { GlobalPhraseData, CommonUsage, PhraseVariant, Register, Nuance, SocialDistance } from '@/lib/db/types';
import { normalizePhraseKey } from '@/lib/db/practice-types';
import { safeParseAIJson } from '@/lib/ai-utils';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

interface LookupRequest {
    phrase: string;
    context?: string;  // Sentence where phrase was found
}

/**
 * Lookup a phrase in the Global Phrase Dictionary
 * Returns cached data if exists, generates and stores if not
 */
export async function POST(request: NextRequest) {
    try {
        const body: LookupRequest = await request.json();
        const { phrase, context } = body;

        if (!phrase || phrase.trim().length === 0) {
            return NextResponse.json(
                { error: 'Phrase is required' },
                { status: 400 }
            );
        }

        const phraseKey = normalizePhraseKey(phrase.trim());

        // 1. Check global dictionary first (cache hit)
        let existing = null;
        try {
            existing = await getDocument('phraseDictionary', phraseKey);

            if (existing) {
                // Increment lookup count
                try {
                    await updateDocument('phraseDictionary', phraseKey, {
                        lookupCount: (existing.lookupCount as number || 0) + 1,
                    });
                } catch (updateErr) {
                    console.warn('Failed to update lookup count:', updateErr);
                }

                return NextResponse.json({
                    data: existing as unknown as GlobalPhraseData,
                    cached: true,
                    success: true,
                });
            }
        } catch (getErr) {
            // Permission error or collection doesn't exist - treat as cache miss
            console.log('Cache miss (may be new collection):', getErr);
        }

        // 2. Cache miss - generate all data
        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json(
                { error: 'API key not configured' },
                { status: 500 }
            );
        }

        console.log(`Generating phrase data for: "${phrase}"`);
        const { data: generatedData, tokenUsage } = await generatePhraseData(phrase, context);

        if (tokenUsage) {
            console.log(`Token usage - Prompt: ${tokenUsage.prompt_tokens}, Completion: ${tokenUsage.completion_tokens}, Total: ${tokenUsage.total_tokens}`);
        }

        if (!generatedData) {
            return NextResponse.json(
                { error: 'Failed to generate phrase data' },
                { status: 500 }
            );
        }

        // 3. Store globally for future lookups
        const fullData: GlobalPhraseData = {
            phraseKey,
            phrase: phrase.trim(),
            ...generatedData,
            lookupCount: 1,
            saveCount: 0,
            generatedAt: serverTimestamp() as unknown as GlobalPhraseData['generatedAt'],
        };

        try {
            await setDocument('phraseDictionary', phraseKey, fullData as unknown as Record<string, unknown>);
            console.log(`Cached phrase: ${phraseKey}`);
        } catch (setErr) {
            console.warn('Failed to cache phrase (continuing anyway):', setErr);
        }

        return NextResponse.json({
            data: fullData,
            cached: false,
            tokenUsage,
            success: true,
        });

    } catch (error) {
        console.error('Lookup phrase error:', error);
        return NextResponse.json(
            { error: 'Failed to lookup phrase' },
            { status: 500 }
        );
    }
}

/**
 * Generate all phrase data using AI
 */
interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

type GeneratedPhraseData = Omit<GlobalPhraseData, 'phraseKey' | 'phrase' | 'lookupCount' | 'saveCount' | 'generatedAt'>;

async function generatePhraseData(
    phrase: string,
    context?: string
): Promise<{ data: GeneratedPhraseData | null; tokenUsage?: TokenUsage }> {

    const prompt = `Analyze this English phrase/word: "${phrase}"
${context ? `Context: "${context}"` : ''}

Generate comprehensive learning data. IMPORTANT: Tags are ARRAYS - assign ALL values where the phrase would sound NATURAL.

Return JSON:
{
  "baseForm": "NORMALIZED base form - replace pronouns with one's/someone's (e.g., 'put his foot in his mouth' → 'put one's foot in one's mouth')",
  "meaning": "clear, concise definition in English",
  "context": "${context || 'an example sentence using this phrase'}",
  "contextTranslation": "Vietnamese translation of the context sentence",
  "pronunciation": "IPA transcription",
  
  "register": ["Array of ALL registers where this phrase sounds NATURAL"],
  "nuance": ["Array of ALL applicable sentiments/connotations"],
  "socialDistance": ["Array of ALL relationship contexts where this phrase is natural"],
  "topic": ["Array of relevant topics"],
  "subtopic": ["Array of relevant subtopics"],
  
  "isHighFrequency": true/false,
  "commonUsages": [{"phrase": "...", "meaning": "...", "example": "...", "type": "collocation|phrasal_verb|idiom|expression"}],
  "registerVariants": [{"phrase": "...", "register": "...", "nuance": "...", "relationship": "register_variant"}],
  "nuanceVariants": [{"phrase": "...", "register": "...", "nuance": "...", "relationship": "nuance_variant"}]
}

TAG VALUE OPTIONS:

register (formality - WHERE/WHEN used):
- "casual": slang, texting, friends (gonna, cool, chill out)
- "consultative": standard everyday speech (discuss, consider)
- "formal": academic, business, official (subsequently, hereby)

nuance (emotional connotation of the WORD ITSELF):
- "negative": describes bad/harmful things (traumatize, suffer, destroy)
- "slightly_negative": mildly unfavorable (inconvenient, disappointing)
- "neutral": factual, no emotional charge (analyze, occur, proceed)
- "slightly_positive": mildly favorable (helpful, decent, promising)
- "positive": describes good things (thrive, celebrate, excellent)

socialDistance (WHO you'd say this to - relationship context):
- "close": family, best friends, partner ("What's up?", "No worries")
- "friendly": friends, acquaintances, classmates ("Hey, how's it going?")
- "neutral": strangers, general public ("Excuse me", "Could you help?")
- "hierarchical_up": to authority - boss, teacher, client ("I'd like to request...")
- "hierarchical_down": to subordinates ("Make sure to...", "I need you to...")
- "hierarchical_peer": same-level colleagues ("Let's sync up", "Quick question...")
- "professional": business/service contexts ("Per our discussion", "I'll follow up")

EXAMPLES of multi-value assignment:
- "Thanks a lot" → register: ["casual", "consultative"], socialDistance: ["close", "friendly", "neutral"]
- "I appreciate it" → register: ["consultative", "formal"], socialDistance: ["friendly", "hierarchical_up", "professional"]
- "I'd be grateful if..." → register: ["formal"], socialDistance: ["hierarchical_up", "professional"]

Rules:
- Assign ALL natural values, not just one - naturalness is the goal
- baseForm: Use dictionary form with 'one's' for possessives
- commonUsages: 0-5 items, registerVariants/nuanceVariants: 0-3 items
- Return ONLY valid JSON, no markdown`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a language learning expert. Generate accurate vocabulary data with multi-value tags for naturalness. Always return valid JSON only.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 1500,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('DeepSeek API error:', await response.text());
            return { data: null };
        }

        const apiResponse = await response.json();
        const content = apiResponse.choices?.[0]?.message?.content || '';
        const tokenUsage = apiResponse.usage as TokenUsage | undefined;

        const cleanedContent = content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parseResult = safeParseAIJson<any>(cleanedContent);
        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            return { data: null };
        }
        const parsed = parseResult.data;

        return {
            data: {
                baseForm: parsed.baseForm || phrase,
                meaning: parsed.meaning,
                context: parsed.context || context,
                contextTranslation: parsed.contextTranslation,
                pronunciation: parsed.pronunciation,
                // Multi-value arrays - keep as arrays, fallback to array if single value
                register: Array.isArray(parsed.register) ? parsed.register : [parsed.register || 'consultative'],
                nuance: Array.isArray(parsed.nuance) ? parsed.nuance : [parsed.nuance || 'neutral'],
                socialDistance: Array.isArray(parsed.socialDistance) ? parsed.socialDistance : (parsed.socialDistance ? [parsed.socialDistance] : ['neutral']),
                topic: Array.isArray(parsed.topic) ? parsed.topic : [parsed.topic || 'general'],
                subtopic: Array.isArray(parsed.subtopic) ? parsed.subtopic : (parsed.subtopic ? [parsed.subtopic] : []),
                isHighFrequency: parsed.isHighFrequency ?? false,
                commonUsages: (parsed.commonUsages || []) as CommonUsage[],
                registerVariants: (parsed.registerVariants || []) as PhraseVariant[],
                nuanceVariants: (parsed.nuanceVariants || []) as PhraseVariant[],
            },
            tokenUsage,
        };

    } catch (error) {
        console.error('Error generating phrase data:', error);
        return { data: null };
    }
}

/**
 * GET: Check if phrase exists in dictionary (quick check)
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const phrase = searchParams.get('phrase');

    if (!phrase) {
        return NextResponse.json({ error: 'Phrase required' }, { status: 400 });
    }

    const phraseKey = normalizePhraseKey(phrase);
    const existing = await getDocument('phraseDictionary', phraseKey);

    return NextResponse.json({
        exists: !!existing,
        phraseKey,
    });
}
