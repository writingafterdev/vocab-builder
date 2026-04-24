import type { LearningBand, QuestionType, SessionQuestion } from '@/lib/db/types';

export const RECOGNITION_TYPES: QuestionType[] = [
    'inference_bridge',
    'tone_interpretation',
    'best_response',
    'ab_natural',
];

export const ACTIVE_RECALL_TYPES: QuestionType[] = [
    'fill_blank',
    'match_pairs',
    'ab_natural',
    'best_response',
    'build_sentence',
    'spot_and_fix',
];

export const PRODUCTION_TYPES: QuestionType[] = [
    'fix_argument',
    'register_shift',
    'synthesis_response',
];

export const LOW_COST_TYPES = new Set<QuestionType>([
    ...RECOGNITION_TYPES,
    ...ACTIVE_RECALL_TYPES,
]);

export const FEED_SURFACE_TYPES = new Set<QuestionType>([
    'inference_bridge',
    'tone_interpretation',
    'best_response',
    'ab_natural',
    'fill_blank',
]);

export function candidateBandsForTarget(learningBand: LearningBand): LearningBand[] {
    if (learningBand === 'production') return ['production', 'active_recall', 'recognition'];
    if (learningBand === 'active_recall') return ['active_recall', 'recognition'];
    return ['recognition'];
}

export function onDemandGenerationBandForTarget(learningBand: LearningBand): LearningBand {
    return learningBand === 'production' ? 'active_recall' : learningBand;
}

export function isProductionQuestionType(type: QuestionType): boolean {
    return PRODUCTION_TYPES.includes(type);
}

export function canGenerateQuestionType(type: QuestionType, allowProduction: boolean): boolean {
    if (isProductionQuestionType(type)) return allowProduction;
    return LOW_COST_TYPES.has(type);
}

export function shouldUseFeed(question: SessionQuestion): boolean {
    return Boolean(question.isFeedEligible) && FEED_SURFACE_TYPES.has(question.type);
}

export function shouldExcludeSeenQuestion(
    questionId: string,
    seenIds: Set<string>,
    surface: 'feed' | 'practice',
): boolean {
    if (!seenIds.has(questionId)) return false;
    return surface === 'feed' || surface === 'practice';
}
