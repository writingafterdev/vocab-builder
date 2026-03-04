import { NextRequest, NextResponse } from 'next/server';
import { safeParseAIJson } from '@/lib/ai-utils';
import { getDocument, setDocument, updateDocument, serverTimestamp } from '@/lib/firestore-rest';
import {
    PracticeQuestion,
    GlobalQuestionBank,
    normalizePhraseKey,
    getInputModeForRegister,
    getTimeLimitForRegister,
    DEFAULT_PRACTICE_CONFIG
} from '@/lib/db/practice-types';
import { GlobalPhraseData, PhraseVariant } from '@/lib/db/types';

const XAI_API_KEY = process.env.XAI_API_KEY;
const DEEPSEEK_API_URL = 'https://api.x.ai/v1/chat/completions';

// Helper: Shuffle array
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// Register weight for sorting
const REGISTER_WEIGHT: Record<string, number> = {
    'casual': 1,
    'consultative': 2,
    'formal': 3,
};

/**
 * Generate variant-based questions from stored registerVariants/nuanceVariants
 * These questions use pre-generated data instead of AI-generating options
 */
function generateVariantBasedQuestions(
    phrase: { id: string; phrase: string; register: string; nuance: string; },
    phraseData: GlobalPhraseData
): Array<{ type: string; content: Record<string, unknown>; }> {
    const questions: Array<{ type: string; content: Record<string, unknown>; }> = [];
    const variants = phraseData.registerVariants || [];
    const nuanceVariants = phraseData.nuanceVariants || [];

    // CONTRAST EXPOSURE: Compare main phrase vs a register variant
    if (variants.length > 0) {
        const variant = variants[0];
        const isVariantMoreFormal = REGISTER_WEIGHT[variant.register] > REGISTER_WEIGHT[phrase.register];

        questions.push({
            type: 'contrast_exposure',
            content: {
                phraseA: phrase.phrase,
                phraseB: variant.phrase,
                meaningA: phraseData.meaning,
                meaningB: `${variant.register} alternative`,
                options: [
                    isVariantMoreFormal
                        ? `Phrase B is more formal`
                        : `Phrase B is more casual`,
                    "They mean exactly the same thing",
                    "Phrase A is only for written English",
                    "They're used in different countries"
                ],
                correctIndex: 0,
            }
        });
    }

    // REGISTER SORTING: Sort all variants by formality (need 2+ variants)
    if (variants.length >= 2) {
        // Collect all phrases with register info
        const allPhrases = [
            { phrase: phrase.phrase, register: phrase.register },
            ...variants.map(v => ({ phrase: v.phrase, register: v.register }))
        ].slice(0, 4); // Max 4 for UI

        // Sort by register weight
        const sortedPhrases = [...allPhrases].sort(
            (a, b) => REGISTER_WEIGHT[a.register] - REGISTER_WEIGHT[b.register]
        );

        // Create shuffled list and correct order
        const shuffled = shuffleArray(allPhrases.map(p => p.phrase));
        const correctOrder = sortedPhrases.map(p => shuffled.indexOf(p.phrase));

        questions.push({
            type: 'register_sorting',
            content: {
                phrases: shuffled,
                correctOrder,
                registers: ['Casual', 'Neutral', 'Formal'],
            }
        });
    }

    // TONE INTERPRETATION: If we have nuance variants with different sentiments
    if (nuanceVariants.length > 0) {
        const variant = nuanceVariants[0];

        // Map nuance to emotion options
        const phraseNuance = Array.isArray(phraseData.nuance) ? phraseData.nuance[0] : phraseData.nuance;
        const nuanceEmoji: Record<string, string> = {
            'negative': '😤 Frustrated',
            'slightly_negative': '😕 Concerned',
            'neutral': '😐 Neutral',
            'slightly_positive': '🙂 Pleased',
            'positive': '😊 Happy',
        };

        const correctEmotion = nuanceEmoji[phraseNuance] || '😐 Neutral';
        const options = Object.values(nuanceEmoji).filter(e => e !== correctEmotion).slice(0, 3);
        options.splice(Math.floor(Math.random() * 4), 0, correctEmotion);

        questions.push({
            type: 'tone_interpretation',
            content: {
                phrase: phrase.phrase,
                context: phraseData.context || `Someone says: "${phrase.phrase}"`,
                options: options.slice(0, 4),
                correctIndex: options.indexOf(correctEmotion),
                explanation: `This phrase typically conveys a ${phraseNuance} tone.`,
            }
        });
    }

    return questions;
}

interface GeneratePracticeRequest {
    phrases: {
        id: string;
        phrase: string;
        register: 'casual' | 'consultative' | 'formal';
        nuance: 'negative' | 'neutral' | 'positive';
        topic?: string;
        usedContexts?: Array<{ topic: string; register: string; }>;
    }[];
    mode?: 'in_context' | 'open_production';
}

/**
 * Generate practice questions for given phrases
 * Uses global question bank for reuse across users
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: GeneratePracticeRequest = await request.json();
        const { phrases, mode = 'in_context' } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        const questions: PracticeQuestion[] = [];
        const newlyGenerated: string[] = [];
        const reused: string[] = [];

        for (const phrase of phrases) {
            const phraseKey = normalizePhraseKey(phrase.phrase);

            // 1. Check global question bank first
            const existingBank = await getDocument('questionBank', phraseKey);

            if (existingBank) {
                // Use existing questions
                const bankData = existingBank as unknown as GlobalQuestionBank;
                const bankQuestions = bankData.questions || [];

                if (bankQuestions.length > 0) {
                    // Pick a random question for this session
                    const randomQ = bankQuestions[Math.floor(Math.random() * bankQuestions.length)];

                    questions.push({
                        id: `${phrase.id}_${Date.now()}`,
                        targetPhraseId: phrase.id,
                        targetPhrase: phrase.phrase,
                        mode,
                        inputMode: getInputModeForRegister(phrase.register),
                        topic: randomQ.topic,
                        situation: randomQ.situation,
                        scenarioText: randomQ.scenarioText,
                        intent: randomQ.intent,
                        options: mode === 'in_context' ? randomQ.options : undefined,
                        correctIndex: mode === 'in_context' ? randomQ.correctIndex : undefined,
                        timeLimitSeconds: getTimeLimitForRegister(phrase.register),
                        register: phrase.register,
                        nuance: phrase.nuance,
                    });

                    // Increment usage count
                    await updateDocument('questionBank', phraseKey, {
                        usageCount: (bankData.usageCount || 0) + 1
                    });
                    reused.push(phrase.phrase);
                    continue;
                }
            }

            // 2. Try to generate variant-based questions from phrase dictionary
            const phraseData = await getDocument('phraseDictionary', phraseKey) as GlobalPhraseData | null;

            if (phraseData && (phraseData.registerVariants?.length || phraseData.nuanceVariants?.length)) {
                // Generate questions from stored variants (no AI call needed)
                const variantQuestions = generateVariantBasedQuestions(phrase, phraseData);

                if (variantQuestions.length > 0) {
                    // Pick one variant question for this session
                    const selectedQ = variantQuestions[Math.floor(Math.random() * variantQuestions.length)];

                    questions.push({
                        id: `${phrase.id}_${Date.now()}`,
                        targetPhraseId: phrase.id,
                        targetPhrase: phrase.phrase,
                        mode,
                        inputMode: getInputModeForRegister(phrase.register),
                        // Required fields for PracticeQuestion
                        topic: phrase.topic || 'vocabulary',
                        situation: `Practice: ${selectedQ.type.replace('_', ' ')}`,
                        scenarioText: '',
                        // Spread variant question content
                        questionType: selectedQ.type,
                        ...selectedQ.content,
                        timeLimitSeconds: getTimeLimitForRegister(phrase.register),
                        register: phrase.register,
                        nuance: phrase.nuance,
                        generatedFrom: 'variants',
                    } as PracticeQuestion);

                    reused.push(phrase.phrase + ' (variants)');
                    continue;
                }
            }

            // 3. Generate new questions for this phrase using AI
            // Fetch usedContexts from savedPhrases if not provided
            let usedContexts = phrase.usedContexts || [];
            if (usedContexts.length === 0) {
                try {
                    const savedPhrase = await getDocument('savedPhrases', phrase.id);
                    if (savedPhrase && (savedPhrase as any).practiceHistory?.usedContexts) {
                        usedContexts = (savedPhrase as any).practiceHistory.usedContexts;
                    }
                } catch (e) {
                    // Ignore - no history available
                }
            }
            const generatedQuestions = await generateQuestionsForPhrase(phrase, usedContexts);

            if (generatedQuestions.length > 0) {
                // Store in global bank for future users
                await setDocument('questionBank', phraseKey, {
                    phraseKey,
                    phrase: phrase.phrase,
                    register: phrase.register,
                    nuance: phrase.nuance,
                    questions: generatedQuestions.map(q => ({
                        mode: q.mode,
                        topic: q.topic,
                        situation: q.situation,
                        scenarioText: q.scenarioText,
                        intent: q.intent,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        explanation: q.explanation,
                        trivia: q.trivia,
                    })),
                    generatedAt: serverTimestamp(),
                    usageCount: 1,
                });

                // Use first question for this session
                const q = generatedQuestions[0];
                questions.push({
                    id: `${phrase.id}_${Date.now()}`,
                    targetPhraseId: phrase.id,
                    targetPhrase: phrase.phrase,
                    mode,
                    inputMode: getInputModeForRegister(phrase.register),
                    topic: q.topic,
                    situation: q.situation,
                    scenarioText: q.scenarioText,
                    intent: q.intent,
                    options: mode === 'in_context' ? q.options : undefined,
                    correctIndex: mode === 'in_context' ? q.correctIndex : undefined,
                    explanation: q.explanation,
                    trivia: q.trivia,
                    timeLimitSeconds: getTimeLimitForRegister(phrase.register),
                    register: phrase.register,
                    nuance: phrase.nuance,
                });

                newlyGenerated.push(phrase.phrase);
            }
        }

        return NextResponse.json({
            questions,
            stats: {
                total: questions.length,
                reused: reused.length,
                newlyGenerated: newlyGenerated.length,
            },
            success: true,
        });

    } catch (error) {
        console.error('Generate practice error:', error);
        return NextResponse.json(
            { error: 'Failed to generate practice questions' },
            { status: 500 }
        );
    }
}

/**
 * Generate questions for a single phrase using AI
 */
async function generateQuestionsForPhrase(
    phrase: {
        phrase: string;
        register: 'casual' | 'consultative' | 'formal';
        nuance: 'negative' | 'neutral' | 'positive';
        topic?: string;
    },
    usedContexts: Array<{ topic: string; register: string; }> = []
): Promise<Array<{
    mode: 'in_context' | 'open_production';
    topic: string;
    situation: string;
    scenarioText: string;
    intent?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    trivia?: string;
}>> {
    const registerDescriptions = {
        casual: 'informal, friendly, everyday conversation',
        consultative: 'professional but friendly, workplace appropriate',
        formal: 'very professional, official, business correspondence',
    };

    const nuanceDescriptions = {
        negative: 'critical, concerned, or cautionary',
        neutral: 'balanced, objective, matter-of-fact',
        positive: 'encouraging, appreciative, or optimistic',
    };

    // Build list of topics to avoid (already used in previous sessions)
    const usedTopicsList = usedContexts.map(c => c.topic).filter(Boolean);
    const avoidTopicsText = usedTopicsList.length > 0
        ? `\n\nAVOID THESE TOPICS (already used in previous practice sessions):\n${usedTopicsList.map(t => `- ${t}`).join('\n')}\n\nGenerate scenarios with DIFFERENT topics/contexts than the ones listed above.`
        : '';

    const prompt = `Generate 5 practice scenarios for the phrase: "${phrase.phrase}"

Register: ${phrase.register} (${registerDescriptions[phrase.register]})
Nuance: ${phrase.nuance} (${nuanceDescriptions[phrase.nuance]})
Topic: ${phrase.topic || 'general'}${avoidTopicsText}

For each scenario:
1. Create a "Reading Comprehension" style narrative paragraph (3-4 sentences minimum) building up context, leading to a situation where the user must determine the absolute best response.
2. The scenario MUST be a rich story or detailed context, not just one sentence. Put this entirely in "scenarioText".
3. Provide a brief 1-sentence description of the situation in "situation".
4. Generate 4 response options as full sentences:
   - 1 absolutely correct and natural option using the target phrase appropriately
   - 3 distractors with wrong register, incorrect nuance, or unnatural grammar
5. Specify the "correctIndex" (0-indexed).
6. Provide an "explanation" detailing exactly WHY the correct option works and why at least one distractor is wrong/unnatural.
7. Provide a "trivia" string (a "Did you know?" style fact about the phrase's origin, usage, or related idiom).
8. Describe the "intent" the user should convey.

IMPORTANT: The target phrase should be hidden in the correct answer - don't mention it in the scenarioText!

Return JSON array EXACTLY matching this schema:
[
  {
    "topic": "business",
    "situation": "Emailing a client about a long delay",
    "scenarioText": "You are managing a crucial enterprise account. Due to a severe backend outage on your company's servers, the client's deployment has been delayed by 48 hours. They are increasingly frustrated as their own launch depends on this. You need to write an opening line for your update email.",
    "intent": "apologize professionally without being overly dramatic",
    "options": [
      "Hey, sorry about that!",
      "I sincerely apologize for the inconvenience this delay has caused.",
      "Whatever, delays happen.",
      "I deeply regret this terrible mistake."
    ],
    "correctIndex": 1,
    "explanation": "Option B fits the 'consultative' register perfectly, acknowledging the issue professionally without groveling. Option A is too casual for a severe outage, and Option D is overly dramatic.",
    "trivia": "Did you know? 'Inconvenience' is one of the most misspelled words in business emails!"
  }
]`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a language learning expert creating practice questions. Always return valid JSON arrays.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('Grok API error:', await response.text());
            return [];
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Clean and parse JSON
        const cleanedContent = content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parseResult = safeParseAIJson<any>(cleanedContent);
        if (!parseResult.success) {
            console.error('AI parse failed:', parseResult.error);
            return [];
        }
        const parsed = Array.isArray(parseResult.data) ? parseResult.data : parseResult.data?.scenarios || [];

        // Validate and add mode
        return parsed.map((q: {
            topic: string;
            situation: string;
            scenarioText: string;
            intent?: string;
            options: string[];
            correctIndex: number;
            explanation?: string;
            trivia?: string;
        }) => ({
            mode: 'in_context' as const,
            topic: q.topic || phrase.topic || 'general',
            situation: q.situation,
            scenarioText: q.scenarioText,
            intent: q.intent,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            trivia: q.trivia,
        }));

    } catch (error) {
        console.error('Error generating questions:', error);
        return [];
    }
}
