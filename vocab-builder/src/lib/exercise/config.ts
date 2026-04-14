/**
 * Exercise System Configuration
 * Constants, mappings, and helpers for the passage-centric exercise system.
 */

import type { SkillAxis, QuestionType, FeedCardType, SourcePlatform } from '@/lib/db/types';

// ── Learning Phases (tied to SRS steps) ──
export type LearningPhase = 'recognition' | 'active_recall' | 'production';

/** Map an SRS learningStep to its learning phase */
export function phaseFromStep(step: number): LearningPhase {
    if (step <= 1) return 'recognition';
    if (step <= 3) return 'active_recall';
    return 'production';
}

/** Which question types are native to each phase */
export const PHASE_QUESTION_TYPES: Record<LearningPhase, QuestionType[]> = {
    recognition: [
        'spot_intruder', 'fallacy_id', 'inference_bridge',
        'tone_interpretation', 'rate_argument', 'swipe_judge',
        'category_sort', 'best_response',
    ],
    active_recall: [
        'restructure', 'register_sort', 'match_pairs',
        'tap_passage', 'fill_blank', 'ab_natural',
        'build_sentence', 'spot_and_fix', 'cloze_passage',
    ],
    production: [
        'fix_argument', 'register_shift', 'synthesis_response',
    ],
};

/**
 * Cumulative mixing ratios — later phases include earlier types.
 * E.g. active_recall = 70% native + 30% recognition reinforcement.
 */
export const PHASE_MIX_RATIOS: Record<LearningPhase, Record<LearningPhase, number>> = {
    recognition:   { recognition: 1.0, active_recall: 0,   production: 0   },
    active_recall: { recognition: 0.3, active_recall: 0.7, production: 0   },
    production:    { recognition: 0.2, active_recall: 0.2, production: 0.6 },
};

/** Phase labels for UI and AI prompt */
export const PHASE_LABELS: Record<LearningPhase, { name: string; goal: string }> = {
    recognition:   { name: 'Recognition',   goal: 'Can you spot it?' },
    active_recall: { name: 'Active Recall', goal: 'Can you work with it?' },
    production:    { name: 'Production',    goal: 'Can you use it?' },
};

// ── Dynamic Session Sizing ──
// Everything scales from the number of due phrases

export interface SessionSize {
    totalQuestions: number;
    excerptCount: number;
    questionsPerExcerpt: number;     // average target
    passageWordRange: [number, number]; // [min, max] words
}

export function computeSessionSize(duePhraseCount: number): SessionSize {
    const capped = Math.max(2, Math.min(duePhraseCount, 15));

    // ~1.5 questions per phrase, floor 4, cap 15
    const totalQuestions = Math.max(4, Math.min(Math.ceil(capped * 1.5), 15));

    // 2-3 questions per excerpt
    const excerptCount = Math.max(2, Math.ceil(totalQuestions / 3));
    const questionsPerExcerpt = Math.ceil(totalQuestions / excerptCount);

    // Passage length scales with phrases: ~120 words per phrase, floor 400, cap 1500
    const minWords = Math.max(400, Math.min(capped * 100, 1200));
    const maxWords = Math.max(600, Math.min(capped * 150, 1500));

    return {
        totalQuestions,
        excerptCount,
        questionsPerExcerpt,
        passageWordRange: [minWords, maxWords],
    };
}

// ── Skill Axis Metadata (colors, labels) ──
export const SKILL_AXIS_META: Record<SkillAxis, { label: string; sublabel: string; color: string }> = {
    cohesion:         { label: 'Structure',  sublabel: 'Flow & cohesion',        color: '#6366f1' },
    naturalness:      { label: 'Expression', sublabel: 'Tone & register',        color: '#f59e0b' },
    task_achievement: { label: 'Logic',      sublabel: 'Reasoning & evidence',   color: '#10b981' },
};

// ── Question Type → Skill Axis ──
export const QUESTION_SKILL_MAP: Record<QuestionType, SkillAxis> = {
    // Cohesion
    spot_intruder: 'cohesion',
    restructure: 'cohesion',
    match_pairs: 'cohesion',
    tap_passage: 'cohesion',
    build_sentence: 'cohesion',
    // Task Achievement
    fallacy_id: 'task_achievement',
    inference_bridge: 'task_achievement',
    rate_argument: 'task_achievement',
    fix_argument: 'task_achievement',
    spot_and_fix: 'task_achievement',
    // Naturalness
    ab_natural: 'naturalness',
    register_sort: 'naturalness',
    tone_interpretation: 'naturalness',
    register_shift: 'naturalness',
    fill_blank: 'naturalness',
    swipe_judge: 'naturalness',
    category_sort: 'naturalness',
    best_response: 'naturalness',
    cloze_passage: 'naturalness',
    // Synthesis (all axes)
    synthesis_response: 'task_achievement',
};

// ── Question Type → Interaction Component ──
export type InteractionComponent = 'mcq' | 'reorder' | 'highlight' | 'rating' | 'freewrite' | 'ab_pick' | 'fill_blank' | 'swipe_judge' | 'match_pairs' | 'tap_passage' | 'category_sort' | 'word_builder' | 'error_tap_fix' | 'dialogue_pick' | 'multi_blank';

export const QUESTION_INTERACTION_MAP: Record<QuestionType, InteractionComponent> = {
    spot_intruder: 'highlight',
    restructure: 'reorder',
    match_pairs: 'match_pairs',
    tap_passage: 'tap_passage',
    fallacy_id: 'mcq',
    inference_bridge: 'mcq',
    rate_argument: 'rating',
    ab_natural: 'ab_pick',
    register_sort: 'reorder',
    tone_interpretation: 'mcq',
    fix_argument: 'freewrite',
    register_shift: 'freewrite',
    synthesis_response: 'freewrite',
    fill_blank: 'fill_blank',
    swipe_judge: 'swipe_judge',
    category_sort: 'category_sort',
    build_sentence: 'word_builder',
    spot_and_fix: 'error_tap_fix',
    best_response: 'dialogue_pick',
    cloze_passage: 'multi_blank',
};

// ── Question Type Labels (user-facing) ──
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    spot_intruder: 'Which doesn\'t belong?',
    restructure: 'Put it in order',
    match_pairs: 'Connect the dots',
    tap_passage: 'Find it in the text',
    fallacy_id: 'Spot the flaw',
    inference_bridge: 'What follows?',
    rate_argument: 'How strong?',
    ab_natural: 'Which sounds right?',
    register_sort: 'Sort by tone',
    tone_interpretation: 'Read between the lines',
    fix_argument: 'Fix the reasoning',
    register_shift: 'Rewrite for a new audience',
    synthesis_response: 'Your turn',
    fill_blank: 'Complete the thought',
    swipe_judge: 'Natural or not?',
    category_sort: 'Sort into groups',
    build_sentence: 'Build the sentence',
    spot_and_fix: 'Find & fix the error',
    best_response: 'What would you say?',
    cloze_passage: 'Fill in the gaps',
};

// ── Question types eligible for listening mode ──
// These types work well when passage/options are heard instead of read
export const LISTENING_ELIGIBLE_TYPES: QuestionType[] = [
    'ab_natural',            // Hear both versions, pick the natural one
    'swipe_judge',           // Hear each card's sentence
    'fill_blank',            // Hear the sentence (blank = pause), fill it
    'best_response',         // Hear the conversation, pick response
    'tone_interpretation',   // Hear the excerpt, identify tone
    'spot_intruder',         // Hear sentences, find the odd one out
    'inference_bridge',      // Hear the claim, what follows?
];

// ── Skill Axis Colors (for UI accents) ──
export const SKILL_AXIS_COLORS: Record<SkillAxis, { accent: string; bg: string; border: string }> = {
    cohesion: { accent: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    task_achievement: { accent: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    naturalness: { accent: 'text-teal-500', bg: 'bg-teal-50', border: 'border-teal-200' },
};

// ── Feed Card Accent Colors ──
export const FEED_CARD_COLORS: Record<FeedCardType, string> = {
    ab_natural: 'border-l-teal-400',
    retry: 'border-l-red-400',
    spot_flaw: 'border-l-amber-400',
    spot_intruder: 'border-l-blue-400',
    fix_it: 'border-l-purple-400',
};

// ── Source Platform Config ──
export const SOURCE_PLATFORM_CONFIG: Record<SourcePlatform, { emoji: string; label: string }> = {
    linkedin: { emoji: '💼', label: 'LinkedIn post' },
    whatsapp: { emoji: '💬', label: 'WhatsApp message' },
    twitter: { emoji: '🐦', label: 'Tweet' },
    reddit: { emoji: '🔗', label: 'Reddit comment' },
    email: { emoji: '📧', label: 'Email' },
    cover_letter: { emoji: '📝', label: 'Cover letter' },
    yelp_review: { emoji: '⭐', label: 'Review' },
    news_oped: { emoji: '📰', label: 'Op-ed' },
};

// ── Feed Card Time Estimates (seconds) ──
export const FEED_CARD_TIME_ESTIMATES: Record<FeedCardType, number> = {
    ab_natural: 20,
    retry: 45,
    spot_flaw: 45,
    spot_intruder: 45,
    fix_it: 120,
};

// ── Active Question Detection ──
const ACTIVE_TYPES: Set<QuestionType> = new Set(['fix_argument', 'register_shift', 'synthesis_response']);

export function isActiveQuestion(type: QuestionType): boolean {
    return ACTIVE_TYPES.has(type);
}

// ── Weakness Weight Calculation ──
export function calculateWeight(wrongCount: number, correctCount: number): number {
    const total = wrongCount + correctCount;
    if (total === 0) return 0;
    return Number((wrongCount / total).toFixed(2));
}

// ── Weakness Thresholds ──
export const WEAKNESS_THRESHOLDS = {
    /** Weight above which a question type is considered "weak" */
    weak: 0.5,
    /** Minimum attempts before the system starts weighting */
    minAttempts: 3,
    /** Max recent errors stored per weakness doc */
    maxRecentErrors: 10,
};
