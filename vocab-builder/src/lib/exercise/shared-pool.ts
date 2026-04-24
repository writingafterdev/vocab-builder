import 'server-only';

import crypto from 'crypto';
import { callGrok, getGrokKey } from '@/lib/grok-client';
import {
    getDocument,
    queryCollection,
    serverTimestamp,
    setDocument,
    addDocument,
    safeDocId,
} from '@/lib/appwrite/database';
import { phaseFromStep, QUESTION_SKILL_MAP } from '@/lib/exercise/config';
import {
    ACTIVE_RECALL_TYPES,
    canGenerateQuestionType,
    candidateBandsForTarget,
    FEED_SURFACE_TYPES,
    LOW_COST_TYPES,
    onDemandGenerationBandForTarget,
    PRODUCTION_TYPES,
    RECOGNITION_TYPES,
    shouldExcludeSeenQuestion,
    shouldUseFeed,
} from '@/lib/exercise/pool-policy';
import { recordResult } from '@/lib/db/question-weaknesses';
import type {
    DifficultyBand,
    FeedCard,
    LearningBand,
    QuestionType,
    SessionQuestion,
    SkillAxis,
} from '@/lib/db/types';

type SavedPhraseLite = {
    id: string;
    phrase: string;
    meaning?: string;
    context?: string;
    register?: string;
    topics?: string[];
    learningStep?: number;
    nextReviewDate?: unknown;
};

type CompletedSessionDoc = {
    id: string;
    userId: string;
    sessionId: string;
    type: string;
    score: number;
    data?: string;
    completedAt?: string;
};

type AttemptLog = {
    questionId: string;
    questionType?: QuestionType;
    learningBand?: LearningBand;
    testedPhraseIds?: string[];
    correct: boolean;
    surface: 'feed' | 'practice';
    userAnswer?: string;
    completedAt: string;
};

type SharedPoolMeta = {
    mode: 'shared_pool_v3';
    phraseKey: string;
    phrase: string;
    learningBand: LearningBand;
    difficultyBand: DifficultyBand;
    generatedAt: string;
    generationMode: 'pooled' | 'ondemand_refill' | 'scheduled_prefill';
    lexilePolicy: string;
};

type PracticeBatchMeta = {
    mode: 'practice_batch_v3';
    summary: string;
    phraseBands: Array<{ phraseId: string; phrase: string; learningBand: LearningBand }>;
    generatedAt: string;
};

type RawPoolQuestion = {
    type: QuestionType;
    prompt: string;
    context: string;
    contextType?: SessionQuestion['contextType'];
    skillAxis?: SkillAxis;
    explanation: string;
    options?: string[];
    correctIndex?: number;
    blankSentence?: string;
    wordBank?: string[];
    correctWord?: string;
    pairs?: Array<{ left: string; right: string }>;
    dialogueTurns?: Array<{ speaker: string; text: string }>;
    responseOptions?: string[];
    correctResponseIndex?: number;
    sentenceChips?: string[];
    correctSentence?: string;
    errorSentence?: string;
    errorSegments?: string[];
    errorIndex?: number;
    correctFix?: string;
    testedPhraseIds?: string[];
    contextPhraseIds?: string[];
    productionTargetPhraseIds?: string[];
    expectedPhrases?: string[];
    expectedPhraseIds?: string[];
    evaluationCriteria?: string[];
  };

type GenerationTarget = {
    phraseId: string;
    phrase: string;
    phraseKey: string;
    meaning: string;
    context: string;
    learningBand: LearningBand;
    difficultyBand: DifficultyBand;
    supportPhrases: string[];
};

export const SHARED_POOL_STATUS = 'pool_v3';
export const PRACTICE_BATCH_STATUS = 'generated';
export const FEED_CACHE_LIMIT = 6;
export const PRACTICE_BATCH_LIMIT = 10;

const POOL_COLLECTION = 'exerciseQuestionPool';
const ATTEMPT_COLLECTION = 'exerciseQuestionAttempts';
const ON_DEMAND_GENERATION_LIMIT = 4;
const PREFILL_GENERATION_LIMIT = 24;

function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function normalizePhraseKey(phrase: string): string {
    return phrase.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function hashId(raw: string, prefix: string): string {
    const digest = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24);
    return safeDocId(`${prefix}${digest}`);
}

function poolDocId(phraseKey: string, learningBand: LearningBand): string {
    const bandCode = learningBand === 'recognition' ? 'rc' : learningBand === 'active_recall' ? 'ar' : 'pd';
    return hashId(`${phraseKey}:${learningBand}`, `pv3${bandCode}`);
}

function practiceBatchId(userId: string): string {
    return hashId(`${userId}:${Date.now()}:${Math.random()}`, 'pbv3');
}

function feedCacheId(userId: string, dateStr: string): string {
    return safeDocId(`${dateStr}_${userId}`);
}

function parseQuestionsField(value: unknown): SessionQuestion[] {
    if (Array.isArray(value)) return value as SessionQuestion[];
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed as SessionQuestion[] : [];
        } catch {
            return [];
        }
    }
    return [];
}

function parseMetaField<T>(value: unknown): T | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as T;
    if (typeof value === 'string' && value.trim()) {
        try {
            return JSON.parse(value) as T;
        } catch {
            return null;
        }
    }
    return null;
}

function isCollectionMissing(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('Collection') && message.includes('could not be found');
}

function toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (
        typeof value === 'object' &&
        value !== null &&
        'seconds' in value &&
        typeof (value as { seconds: unknown }).seconds === 'number'
    ) {
        const seconds = (value as { seconds: number }).seconds;
        const timestampLike = value as { nanoseconds?: unknown };
        const nanoseconds = typeof timestampLike.nanoseconds === 'number'
            ? timestampLike.nanoseconds
            : 0;
        return new Date((seconds * 1000) + Math.floor(nanoseconds / 1000000));
    }
    if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function difficultyForBand(learningBand: LearningBand): DifficultyBand {
    if (learningBand === 'recognition') return 'simple';
    if (learningBand === 'active_recall') return 'moderate';
    return 'rich';
}

function buildQuestionId(target: GenerationTarget, raw: RawPoolQuestion): string {
    return hashId(
        [
            target.phraseKey,
            target.learningBand,
            raw.type,
            raw.prompt,
            raw.context,
        ].join('|'),
        'qv3'
    );
}

function materializeQuestion(
    question: SessionQuestion,
    phraseKeyToUserId: Map<string, string>,
): SessionQuestion {
    const mapIds = (ids?: string[]) => ids?.map((id) => phraseKeyToUserId.get(id) || id) || [];
    const context = question.context || '';

    return {
        ...question,
        context,
        testedPhraseIds: mapIds(question.testedPhraseIds),
        contextPhraseIds: mapIds(question.contextPhraseIds),
        expectedPhraseIds: mapIds(question.expectedPhraseIds),
        productionTargetPhraseIds: mapIds(question.productionTargetPhraseIds),
        listeningText: question.listeningText || context,
    };
}

function buildFeedCardFromQuestion(question: SessionQuestion, userId: string): FeedCard {
    const sourceLabel = question.contextType === 'dialogue'
        ? '💬 Dialogue'
        : question.contextType === 'social_post'
            ? '📰 Feed'
            : question.contextType === 'message'
                ? '✉️ Message'
                : '📄 Context';

    const cardType = question.type === 'ab_natural'
        ? 'ab_natural'
        : question.type === 'best_response'
            ? 'spot_intruder'
            : question.type === 'fill_blank'
                ? 'spot_flaw'
                : 'spot_flaw';

    return {
        id: question.id,
        userId,
        cardType,
        skillAxis: question.skillAxis,
        questionId: question.id,
        questionType: question.type,
        learningBand: question.learningBand,
        difficultyBand: question.difficultyBand,
        testedPhraseIds: question.testedPhraseIds,
        contextPhraseIds: question.contextPhraseIds,
        sourceContent: question.context || '',
        sourcePlatform: question.contextType === 'social_post' ? 'reddit' : question.contextType === 'message' ? 'whatsapp' : 'news_oped',
        sourceLabel,
        prompt: question.prompt,
        options: question.responseOptions || question.wordBank || question.options || [],
        correctIndex: question.correctResponseIndex ?? question.correctIndex ?? 0,
        explanation: question.explanation,
        estimatedSeconds: question.learningBand === 'recognition' ? 20 : 35,
        createdAt: serverTimestamp(),
        isRetry: false,
    };
}

async function getRecentAttempts(userId: string): Promise<AttemptLog[]> {
    try {
        const attemptDocs = await queryCollection(ATTEMPT_COLLECTION, {
            where: [{ field: 'userId', op: '==', value: userId }],
            orderBy: [{ field: 'completedAt', direction: 'desc' }],
            limit: 250,
        });

        return attemptDocs.map((doc): AttemptLog => ({
            questionId: String(doc.questionId || ''),
            questionType: doc.questionType as QuestionType | undefined,
            learningBand: doc.learningBand as LearningBand | undefined,
            testedPhraseIds: parseMetaField<string[]>(doc.testedPhraseIds) || [],
            correct: Boolean(doc.correct),
            surface: doc.surface === 'practice' ? 'practice' : 'feed',
            userAnswer: typeof doc.userAnswer === 'string' ? doc.userAnswer : undefined,
            completedAt: String(doc.completedAt || serverTimestamp()),
        })).filter((attempt) => attempt.questionId);
    } catch (error) {
        if (!isCollectionMissing(error)) throw error;
    }

    const docs = await queryCollection('completedSessions', {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: [{ field: 'completedAt', direction: 'desc' }],
        limit: 250,
    }) as unknown as CompletedSessionDoc[];

    return docs
        .filter((doc) => doc.type === 'exercise_v3_attempt')
        .map((doc) => {
            const payload = parseMetaField<Omit<AttemptLog, 'completedAt'>>(doc.data) || {} as Omit<AttemptLog, 'completedAt'>;
            return {
                ...payload,
                completedAt: doc.completedAt || serverTimestamp(),
            };
        });
}

async function saveAttemptLog(
    userId: string,
    payload: Omit<AttemptLog, 'completedAt'>,
): Promise<void> {
    const completedAt = serverTimestamp();
    try {
        await addDocument(ATTEMPT_COLLECTION, {
            userId,
            questionId: payload.questionId,
            questionType: payload.questionType || '',
            learningBand: payload.learningBand || '',
            testedPhraseIds: JSON.stringify(payload.testedPhraseIds || []),
            surface: payload.surface,
            correct: payload.correct,
            userAnswer: payload.userAnswer || '',
            completedAt,
        });
        return;
    } catch (error) {
        if (!isCollectionMissing(error)) throw error;
    }

    await addDocument('completedSessions', {
        userId,
        sessionId: payload.questionId,
        type: 'exercise_v3_attempt',
        score: payload.correct ? 1 : 0,
        data: JSON.stringify(payload),
        completedAt,
    });
}

export async function getDuePhraseTargets(userId: string, limit: number = 15): Promise<GenerationTarget[]> {
    const docs = await queryCollection('savedPhrases', {
        where: [{ field: 'userId', op: '==', value: userId }],
        limit: 100,
    }) as unknown as SavedPhraseLite[];

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const due = docs
        .filter((doc) => {
            const nextReviewDate = toDate(doc.nextReviewDate);
            return !doc.nextReviewDate || nextReviewDate <= endOfToday;
        })
        .sort((a, b) => toDate(a.nextReviewDate).getTime() - toDate(b.nextReviewDate).getTime())
        .slice(0, limit);

    return due.map((doc) => {
        const learningBand = phaseFromStep(doc.learningStep || 0);
        const phraseKey = normalizePhraseKey(doc.phrase);
        return {
            phraseId: doc.id,
            phrase: doc.phrase,
            phraseKey,
            meaning: doc.meaning || '',
            context: doc.context || '',
            learningBand,
            difficultyBand: difficultyForBand(learningBand),
            supportPhrases: [],
        };
    });
}

async function getPoolQuestions(phraseKey: string, learningBand: LearningBand): Promise<SessionQuestion[]> {
    const id = poolDocId(phraseKey, learningBand);
    try {
        const poolDoc = await getDocument(POOL_COLLECTION, id);
        if (poolDoc?.status === SHARED_POOL_STATUS) {
            return parseQuestionsField(poolDoc.questions);
        }
    } catch (error) {
        if (!isCollectionMissing(error)) throw error;
    }

    const doc = await getDocument('generatedSessions', id);
    if (!doc || doc.status !== SHARED_POOL_STATUS) return [];
    return parseQuestionsField(doc.questions);
}

async function upsertPoolQuestions(target: GenerationTarget, questions: SessionQuestion[], generationMode: SharedPoolMeta['generationMode']): Promise<void> {
    const id = poolDocId(target.phraseKey, target.learningBand);
    let existing = null;
    try {
        existing = await getDocument(POOL_COLLECTION, id);
    } catch (error) {
        if (!isCollectionMissing(error)) throw error;
    }
    if (!existing) {
        existing = await getDocument('generatedSessions', id);
    }
    const existingQuestions = existing ? parseQuestionsField(existing.questions) : [];
    const deduped = new Map<string, SessionQuestion>();

    [...existingQuestions, ...questions].forEach((question) => {
        deduped.set(question.id, question);
    });

    const meta: SharedPoolMeta = {
        mode: 'shared_pool_v3',
        phraseKey: target.phraseKey,
        phrase: target.phrase,
        learningBand: target.learningBand,
        difficultyBand: target.difficultyBand,
        generatedAt: serverTimestamp(),
        generationMode,
        lexilePolicy: target.learningBand === 'recognition'
            ? 'Keep the context very simple. The saved phrase must stay in the spotlight.'
            : target.learningBand === 'active_recall'
                ? 'Moderate complexity is allowed, but context should stay accessible.'
                : 'Richer context is allowed, but never overwhelm the target phrase.',
    };

    const poolDoc = {
        phraseKey: target.phraseKey,
        phrase: target.phrase,
        learningBand: target.learningBand,
        difficultyBand: target.difficultyBand,
        questions: JSON.stringify(Array.from(deduped.values())),
        status: SHARED_POOL_STATUS,
        generationMode,
        lexilePolicy: meta.lexilePolicy,
        generatedAt: meta.generatedAt,
        updatedAt: serverTimestamp(),
        reuseCount: Number(existing?.reuseCount || 0),
        qualityScore: Number(existing?.qualityScore || 0),
    };

    try {
        await setDocument(POOL_COLLECTION, id, poolDoc);
        return;
    } catch (error) {
        if (!isCollectionMissing(error)) throw error;
    }

    await setDocument('generatedSessions', id, {
        userId: 'global',
        title: target.phrase,
        topic: target.learningBand,
        subtopic: target.difficultyBand,
        content: JSON.stringify(meta),
        questions: JSON.stringify(Array.from(deduped.values())),
        phrases: JSON.stringify([target.phraseKey]),
        status: SHARED_POOL_STATUS,
        createdAt: serverTimestamp(),
        totalPhrases: 1,
    });
}

function fallbackQuestions(target: GenerationTarget): SessionQuestion[] {
    const context = target.context || `People often use "${target.phrase}" in a short everyday sentence.`;
    const distractors = ['to apologize politely', 'to speak very loudly', 'to forget something simple'];
    const options = [target.meaning || `to use "${target.phrase}" naturally`, ...distractors].slice(0, 4);

    const mcq: SessionQuestion = {
        id: hashId(`${target.phraseKey}:fallback:mcq`, 'qv3'),
        type: 'inference_bridge',
        skillAxis: QUESTION_SKILL_MAP.inference_bridge,
        prompt: 'In this context, what does the highlighted phrase help the speaker express?',
        context,
        contextType: 'micro_passage',
        learningBand: target.learningBand,
        difficultyBand: target.difficultyBand,
        targetVisibility: 'natural_only',
        testedPhraseIds: [target.phraseKey],
        contextPhraseIds: [target.phraseKey],
        explanation: `The phrase fits because it points to ${target.meaning || 'the intended meaning in context'}.`,
        options,
        correctIndex: 0,
        isFeedEligible: true,
    };

    const blankSentence = (target.context || `${target.phrase} helps the sentence sound natural.`)
        .replace(new RegExp(target.phrase, 'i'), '____');
    const fillBlank: SessionQuestion = {
        id: hashId(`${target.phraseKey}:fallback:blank`, 'qv3'),
        type: 'fill_blank',
        skillAxis: QUESTION_SKILL_MAP.fill_blank,
        prompt: 'Choose the phrase that completes the sentence most naturally.',
        context,
        contextType: 'micro_passage',
        learningBand: target.learningBand,
        difficultyBand: target.difficultyBand,
        targetVisibility: 'natural_only',
        testedPhraseIds: [target.phraseKey],
        contextPhraseIds: [target.phraseKey],
        explanation: `The target phrase is the best fit for this simple context.`,
        blankSentence,
        wordBank: [target.phrase, 'by contrast', 'in a hurry', 'for example'],
        correctWord: target.phrase,
        options: [target.phrase, 'by contrast', 'in a hurry', 'for example'],
        correctIndex: 0,
        isFeedEligible: true,
    };

    return target.learningBand === 'recognition' ? [mcq, fillBlank] : [fillBlank, mcq];
}

async function generatePoolQuestions(
    targets: GenerationTarget[],
    generationMode: SharedPoolMeta['generationMode'],
    options: { allowProduction?: boolean } = {},
): Promise<void> {
    if (targets.length === 0 || !getGrokKey('exercises')) return;

    const allowProduction = options.allowProduction === true;
    const allowedTypesByBand = allowProduction
        ? `  - recognition: ${RECOGNITION_TYPES.join(', ')}
  - active_recall: ${ACTIVE_RECALL_TYPES.join(', ')}
  - production: ${PRODUCTION_TYPES.join(', ')}`
        : `  - recognition: ${RECOGNITION_TYPES.join(', ')}
  - active_recall: ${ACTIVE_RECALL_TYPES.join(', ')}`;

    const productionRule = allowProduction
        ? `- Production items are allowed only for targets whose learningBand is "production".
- Production items must be reusable prompts with clear evaluationCriteria and expectedPhrases.
- Production contexts may be richer, but must still keep the target phrase salient.`
        : '- Do not create free-writing, synthesis, register-shift, or any expensive production item.';

    const prompt = `Create reusable English-learning exercise questions for the following phrase targets.

Hard constraints:
- Output JSON only: {"items":[...]}.
- Every item must be reusable across many users.
- Early-step recognition contexts must be lexically simple: short, concrete, clear, low-lexile English.
- Do not bury the target phrase inside dense prose.
- ${generationMode === 'ondemand_refill' ? 'This is on-demand refill: keep items short, cheap to serve, and easy to grade.' : 'This is scheduled pre-generation: include deeper practice when the target band calls for it.'}
${productionRule}
- Use only these question types:
${allowedTypesByBand}
- "best_response" items must include dialogueTurns + responseOptions + correctResponseIndex.
- "fill_blank" items must include blankSentence + wordBank + correctWord.
- "ab_natural" and mcq-like items use options + correctIndex.
- "build_sentence" items must include sentenceChips + correctSentence.
- "spot_and_fix" items must include errorSentence + errorSegments + errorIndex + correctFix.
- Production items must include expectedPhrases, expectedPhraseIds, productionTargetPhraseIds, and evaluationCriteria.
- The target phrase should appear naturally in the context, not in the prompt.

Targets:
${targets.map((target, index) => `Target ${index + 1}
- phraseKey: ${target.phraseKey}
- phrase: ${target.phrase}
- meaning: ${target.meaning || 'No definition provided'}
- context clue: ${target.context || 'No context provided'}
- learningBand: ${target.learningBand}
- difficultyBand: ${target.difficultyBand}
- optional support phrases: ${target.supportPhrases.join(', ') || 'none'}
`).join('\n')}

Return:
{
  "items": [
    {
      "phraseKey": "target phrase key",
      "learningBand": "recognition | active_recall",
      "difficultyBand": "simple | moderate",
      "questions": [
        {
          "type": "allowed question type",
          "contextType": "micro_passage | dialogue | message | social_post",
          "context": "the short context",
          "prompt": "question text",
          "explanation": "brief explanation",
          "options": ["..."],
          "correctIndex": 0,
          "blankSentence": "optional",
          "wordBank": ["optional"],
          "correctWord": "optional",
          "dialogueTurns": [{"speaker":"A","text":"..."},{"speaker":"B","text":"..."}],
          "responseOptions": ["optional"],
          "correctResponseIndex": 0,
          "expectedPhrases": ["optional production target phrase text"],
          "expectedPhraseIds": ["phraseKey"],
          "productionTargetPhraseIds": ["phraseKey"],
          "evaluationCriteria": ["optional production grading criterion"],
          "testedPhraseIds": ["phraseKey"],
          "contextPhraseIds": ["phraseKey", "optional_support_phrase_key"]
        }
      ]
    }
  ]
}`;

    const result = await callGrok<{ items?: Array<{ phraseKey: string; learningBand: LearningBand; difficultyBand: DifficultyBand; questions: RawPoolQuestion[] }> }>('exercises', {
        system: 'You create short, reusable, lexically controlled English exercise items. Respond only with valid JSON.',
        prompt,
        temperature: 0.4,
        maxTokens: 2400,
        jsonMode: true,
        requiredFields: ['items'],
    });

    if (!result.success || !result.data.items) {
        for (const target of targets) {
            await upsertPoolQuestions(target, fallbackQuestions(target), generationMode);
        }
        return;
    }

    const byPhraseKey = new Map(result.data.items.map((item) => [item.phraseKey, item]));
    for (const target of targets) {
        const generated = byPhraseKey.get(target.phraseKey);
        if (!generated?.questions?.length) {
            await upsertPoolQuestions(target, fallbackQuestions(target), generationMode);
            continue;
        }

        const mapped = generated.questions
            .filter((question) => canGenerateQuestionType(question.type, allowProduction))
            .filter((question) => allowProduction || LOW_COST_TYPES.has(question.type))
            .map((question) => {
                const context = question.context?.trim() || target.context || `A short context using ${target.phrase}.`;
                const learningBand = generated.learningBand || target.learningBand;
                const testedPhraseIds = question.testedPhraseIds?.length ? question.testedPhraseIds : [target.phraseKey];
                const contextPhraseIds = question.contextPhraseIds?.length ? question.contextPhraseIds : testedPhraseIds;
                const isProduction = PRODUCTION_TYPES.includes(question.type);

                return {
                    id: buildQuestionId(target, question),
                    type: question.type,
                    skillAxis: question.skillAxis || QUESTION_SKILL_MAP[question.type],
                    prompt: question.prompt,
                    explanation: question.explanation,
                    options: question.options,
                    correctIndex: question.correctIndex,
                    blankSentence: question.blankSentence,
                    wordBank: question.wordBank,
                    correctWord: question.correctWord,
                    pairs: question.pairs,
                    dialogueTurns: question.dialogueTurns,
                    responseOptions: question.responseOptions,
                    correctResponseIndex: question.correctResponseIndex,
                    sentenceChips: question.sentenceChips,
                    correctSentence: question.correctSentence,
                    errorSentence: question.errorSentence,
                    errorSegments: question.errorSegments,
                    errorIndex: question.errorIndex,
                    correctFix: question.correctFix,
                    expectedPhrases: question.expectedPhrases?.length ? question.expectedPhrases : isProduction ? [target.phrase] : undefined,
                    expectedPhraseIds: question.expectedPhraseIds?.length ? question.expectedPhraseIds : isProduction ? [target.phraseKey] : undefined,
                    productionTargetPhraseIds: question.productionTargetPhraseIds?.length ? question.productionTargetPhraseIds : isProduction ? [target.phraseKey] : undefined,
                    evaluationCriteria: question.evaluationCriteria?.length
                        ? question.evaluationCriteria
                        : isProduction
                            ? [
                                `Use "${target.phrase}" naturally.`,
                                'Answer the prompt with a clear, context-appropriate response.',
                                'Keep the register appropriate for the situation.',
                            ]
                            : undefined,
                    context,
                    contextType: question.contextType || 'micro_passage',
                    learningBand,
                    difficultyBand: generated.difficultyBand || target.difficultyBand,
                    targetVisibility: 'natural_only',
                    testedPhraseIds,
                    contextPhraseIds,
                    isFeedEligible: !isProduction && FEED_SURFACE_TYPES.has(question.type),
                    listeningText: context,
                } satisfies SessionQuestion;
            });

        await upsertPoolQuestions(target, mapped.length > 0 ? mapped : fallbackQuestions(target), generationMode);
    }
}

async function ensurePoolCoverage(targets: GenerationTarget[]): Promise<void> {
    const missingTargets: GenerationTarget[] = [];

    for (const target of targets) {
        const existing = await getPoolQuestions(target.phraseKey, target.learningBand);
        if (existing.length > 0) continue;

        const refillBand = onDemandGenerationBandForTarget(target.learningBand);
        if (refillBand !== target.learningBand) {
            const lowerCostExisting = await getPoolQuestions(target.phraseKey, refillBand);
            if (lowerCostExisting.length > 0) continue;
        }

        missingTargets.push({
            ...target,
            learningBand: refillBand,
            difficultyBand: difficultyForBand(refillBand),
        });
    }

    if (missingTargets.length === 0) return;
    await generatePoolQuestions(missingTargets.slice(0, ON_DEMAND_GENERATION_LIMIT), 'ondemand_refill', { allowProduction: false });
}

function chooseQuestionsForSurface(
    targets: GenerationTarget[],
    seenIds: Set<string>,
    surface: 'feed' | 'practice',
): SessionQuestion[] {
    const chosen: SessionQuestion[] = [];
    const chosenIds = new Set<string>();
    const phraseKeyToUserId = new Map(targets.map((target) => [target.phraseKey, target.phraseId]));
    const targetQuestionCount = surface === 'feed'
        ? FEED_CACHE_LIMIT
        : Math.max(4, Math.min(PRACTICE_BATCH_LIMIT, Math.ceil(targets.length * 1.4)));

    for (const target of targets) {
        const candidateBands = candidateBandsForTarget(target.learningBand);
        let phraseQuestions: SessionQuestion[] = [];

        for (const band of candidateBands) {
            phraseQuestions = phraseQuestions.concat(
                parseQuestionsField((globalThis as Record<string, unknown>)[`__pool_${target.phraseKey}_${band}`])
            );
        }

        const available = phraseQuestions
            .map((question) => materializeQuestion(question, phraseKeyToUserId))
            .filter((question) => {
                if (chosenIds.has(question.id)) return false;
                if (shouldExcludeSeenQuestion(question.id, seenIds, surface)) return false;
                if (surface === 'feed' && !shouldUseFeed(question)) return false;
                return true;
            });

        if (available[0]) {
            chosen.push(available[0]);
            chosenIds.add(available[0].id);
        }
    }

    if (chosen.length >= targetQuestionCount) {
        return chosen.slice(0, targetQuestionCount);
    }

    for (const target of targets) {
        const candidateBands = candidateBandsForTarget(target.learningBand);
        for (const band of candidateBands) {
            const phraseQuestions = parseQuestionsField((globalThis as Record<string, unknown>)[`__pool_${target.phraseKey}_${band}`]);
            for (const question of phraseQuestions) {
                const materialized = materializeQuestion(question, phraseKeyToUserId);
                if (chosenIds.has(materialized.id)) continue;
                if (surface === 'feed' && !shouldUseFeed(materialized)) continue;
                if (shouldExcludeSeenQuestion(materialized.id, seenIds, surface)) continue;
                chosen.push(materialized);
                chosenIds.add(materialized.id);
                if (chosen.length >= targetQuestionCount) {
                    return chosen;
                }
            }
        }
    }

    return chosen;
}

async function hydratePools(targets: GenerationTarget[]): Promise<void> {
    for (const target of targets) {
        for (const band of candidateBandsForTarget(target.learningBand)) {
            const questions = await getPoolQuestions(target.phraseKey, band);
            (globalThis as Record<string, unknown>)[`__pool_${target.phraseKey}_${band}`] = questions;
        }
    }
}

export async function getFeedCardsForUser(userId: string, forceRefill: boolean = false): Promise<FeedCard[]> {
    const dateStr = new Date().toISOString().split('T')[0];
    const docId = feedCacheId(userId, dateStr);

    if (!forceRefill) {
        const cached = await getDocument('feedQuizzes', docId);
        if (cached?.questions && (cached.difficulty === 'shared_pool_v3' || cached.type === 'shared_pool')) {
            const cards = parseQuestionsField(cached.questions).map((question) => buildFeedCardFromQuestion(question, userId));
            if (cards.length >= 3) {
                return cards;
            }
        }
    }

    const dueTargets = await getDuePhraseTargets(userId, 12);
    if (dueTargets.length === 0) return [];

    const attempts = await getRecentAttempts(userId);
    const seenIds = new Set(attempts.map((attempt) => attempt.questionId));

    await ensurePoolCoverage(dueTargets);
    await hydratePools(dueTargets);

    const questions = chooseQuestionsForSurface(dueTargets, seenIds, 'feed');
    const cards = questions.map((question) => buildFeedCardFromQuestion(question, userId));

    await setDocument('feedQuizzes', docId, {
        userId,
        date: dateStr,
        questions: JSON.stringify(questions),
        generatedAt: serverTimestamp(),
        difficulty: 'shared_pool_v3',
        type: 'shared_pool',
    });

    return cards;
}

export async function preGenerateExercisePools(options: {
    limit?: number;
    includeProduction?: boolean;
} = {}): Promise<{
    scanned: number;
    targets: number;
    generated: number;
    skipped: number;
}> {
    const limit = Math.max(1, Math.min(options.limit || PREFILL_GENERATION_LIMIT, 100));
    const includeProduction = options.includeProduction !== false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const phraseDocs = await queryCollection('savedPhrases', {
        where: [{ field: 'nextReviewDate', op: '<=', value: endOfToday.toISOString() }],
        orderBy: [{ field: 'nextReviewDate', direction: 'asc' }],
        limit,
    }) as unknown as SavedPhraseLite[];

    const uniqueTargets = new Map<string, GenerationTarget>();
    for (const doc of phraseDocs) {
        if (!doc.phrase) continue;
        const learningBand = phaseFromStep(doc.learningStep || 0);
        if (learningBand === 'production' && !includeProduction) continue;

        const phraseKey = normalizePhraseKey(doc.phrase);
        const target: GenerationTarget = {
            phraseId: doc.id,
            phrase: doc.phrase,
            phraseKey,
            meaning: doc.meaning || '',
            context: doc.context || '',
            learningBand,
            difficultyBand: difficultyForBand(learningBand),
            supportPhrases: [],
        };
        uniqueTargets.set(`${phraseKey}:${learningBand}`, target);
    }

    const missingTargets: GenerationTarget[] = [];
    for (const target of uniqueTargets.values()) {
        const existing = await getPoolQuestions(target.phraseKey, target.learningBand);
        if (existing.length === 0) {
            missingTargets.push(target);
        }
    }

    if (missingTargets.length > 0) {
        await generatePoolQuestions(missingTargets, 'scheduled_prefill', { allowProduction: includeProduction });
    }

    return {
        scanned: phraseDocs.length,
        targets: uniqueTargets.size,
        generated: missingTargets.length,
        skipped: uniqueTargets.size - missingTargets.length,
    };
}

export async function getNextPracticeBatch(userId: string): Promise<{ sessionId: string; questions: SessionQuestion[] } | null> {
    const existing = await queryCollection('generatedSessions', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'status', op: '==', value: 'in_progress' },
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 10,
    });

    const existingV3 = existing.find((doc) => parseMetaField<PracticeBatchMeta>(doc.content)?.mode === 'practice_batch_v3');
    if (existingV3) {
        return {
            sessionId: existingV3.id,
            questions: parseQuestionsField(existingV3.questions),
        };
    }

    const generated = await queryCollection('generatedSessions', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'status', op: '==', value: 'generated' },
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 10,
    });

    const generatedV3 = generated.find((doc) => parseMetaField<PracticeBatchMeta>(doc.content)?.mode === 'practice_batch_v3');
    if (generatedV3) {
        return {
            sessionId: generatedV3.id,
            questions: parseQuestionsField(generatedV3.questions),
        };
    }

    const dueTargets = await getDuePhraseTargets(userId, 15);
    if (dueTargets.length === 0) return null;

    const attempts = await getRecentAttempts(userId);
    const seenIds = new Set(attempts.map((attempt) => attempt.questionId));

    await ensurePoolCoverage(dueTargets);
    await hydratePools(dueTargets);

    const questions = chooseQuestionsForSurface(dueTargets, seenIds, 'practice');
    if (questions.length === 0) return null;

    const phraseIdSet = new Set<string>();
    questions.forEach((question) => {
        asArray(question.testedPhraseIds).forEach((phraseId) => phraseIdSet.add(phraseId));
    });

    const batchMeta: PracticeBatchMeta = {
        mode: 'practice_batch_v3',
        summary: `${questions.length} question${questions.length > 1 ? 's' : ''} from the shared phrase pool`,
        phraseBands: dueTargets.map((target) => ({
            phraseId: target.phraseId,
            phrase: target.phrase,
            learningBand: target.learningBand,
        })),
        generatedAt: serverTimestamp(),
    };

    const sessionId = practiceBatchId(userId);
    await setDocument('generatedSessions', sessionId, {
        userId,
        title: 'Practice Batch',
        topic: dueTargets[0]?.phrase || 'Practice',
        subtopic: batchMeta.summary,
        content: JSON.stringify(batchMeta),
        questions: JSON.stringify(questions),
        phrases: JSON.stringify(Array.from(phraseIdSet)),
        status: PRACTICE_BATCH_STATUS,
        createdAt: serverTimestamp(),
        totalPhrases: phraseIdSet.size,
    });

    return { sessionId, questions };
}

export async function submitFeedAttempt(input: {
    userId: string;
    questionId: string;
    questionType?: QuestionType;
    learningBand?: LearningBand;
    testedPhraseIds?: string[];
    correct: boolean;
    userAnswer?: string;
}): Promise<void> {
    await saveAttemptLog(input.userId, {
        questionId: input.questionId,
        questionType: input.questionType,
        learningBand: input.learningBand,
        testedPhraseIds: input.testedPhraseIds,
        correct: input.correct,
        surface: 'feed',
        userAnswer: input.userAnswer,
    });

    if (input.questionType) {
        await recordResult(input.userId, input.questionType, input.correct, {
            feedCardId: input.questionId,
            userAnswer: input.userAnswer || '',
        });
    }
}

export async function savePracticeAttemptLogs(
    userId: string,
    surface: 'practice',
    results: Array<{
        questionId: string;
        type: QuestionType;
        correct: boolean;
        userAnswer: string;
        learningBand?: LearningBand;
        testedPhraseIds?: string[];
    }>,
): Promise<void> {
    await Promise.all(results.map((result) => saveAttemptLog(userId, {
        questionId: result.questionId,
        questionType: result.type,
        learningBand: result.learningBand,
        testedPhraseIds: result.testedPhraseIds,
        correct: result.correct,
        surface,
        userAnswer: result.userAnswer,
    })));
}
