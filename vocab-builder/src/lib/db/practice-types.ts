/**
 * Practice Types for Guided Practice System
 */
import { Timestamp } from '@/lib/firebase/firestore';
import { Register, Nuance } from './types';

// Practice mode - MCQ vs free response
export type PracticeMode = 'in_context' | 'open_production';

// Input mode - based on register (formal = type, casual = voice)
export type InputMode = 'type' | 'voice';

// Question result status
export type QuestionResult = 'correct' | 'wrong' | 'partial' | 'skipped' | 'revealed';

/**
 * A single practice question
 */
export interface PracticeQuestion {
    id: string;
    targetPhraseId: string;
    targetPhrase: string;
    mode: PracticeMode;
    inputMode: InputMode;

    // Scenario content
    topic: string;
    situation: string;
    scenarioText: string;
    intent?: string;  // For nuance testing (e.g., "apologize professionally")

    // For MCQ (in_context) mode
    options?: string[];  // Full sentences as options
    correctIndex?: number;
    explanation?: string; // Why the answer is correct/wrong
    trivia?: string;      // Fun fact or "Did you know?" tip

    // Timing
    timeLimitSeconds: number;  // 90 for formal, 30 for casual/consultative

    // Metadata
    register: Register;
    nuance: Nuance;
}

/**
 * Result of answering a single question
 */
export interface QuestionAnswer {
    questionId: string;
    response: string;
    selectedIndex?: number;  // For MCQ mode
    result: QuestionResult;
    responseTimeMs: number;
    xpEarned: number;
    feedback?: string;
}

/**
 * A practice session containing multiple questions
 */
export interface PracticeSession {
    id: string;
    userId: string;
    topic: string;
    mode: PracticeMode;
    questions: PracticeQuestion[];
    answers: QuestionAnswer[];

    // Session state
    currentQuestionIndex: number;
    startedAt: Timestamp;
    completedAt?: Timestamp;

    // Summary
    totalXp: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
}

/**
 * Global Question Bank entry (shared across all users)
 */
export interface GlobalQuestionBank {
    phraseKey: string;   // Normalized: "apologize_for_the_inconvenience"
    phrase: string;      // Original: "apologize for the inconvenience"
    register: Register;
    nuance: Nuance;

    questions: Omit<PracticeQuestion, 'id' | 'targetPhraseId' | 'targetPhrase'>[];

    generatedAt: Timestamp;
    usageCount: number;  // Track how many users have this phrase
}

/**
 * Pre-generated daily practice for a user
 */
export interface DailyPractice {
    userId: string;
    date: string;  // YYYY-MM-DD format
    questions: PracticeQuestion[];
    generatedAt: Timestamp;
    isStale: boolean;  // True if user saved new phrases after generation
}

/**
 * Practice configuration (admin adjustable)
 */
export interface PracticeConfig {
    // Time limits by register
    timeLimits: {
        formal: number;       // 90 sec
        consultative: number; // 30 sec
        casual: number;       // 30 sec
    };

    // XP rewards/penalties
    xp: {
        correctFast: number;  // +10
        correctSlow: number;  // +5
        partial: number;      // +3
        wrong: number;        // -5
        tooSlow: number;      // -3
        skip: number;         // -3
        reveal: number;       // -5
    };

    // Variant management
    maxVariantsPerPhrase: number;    // 3
    daysBetweenVariants: number;     // 7

    // Practice mode switching (legacy — use inline.productionThreshold instead)
    switchToOpenProductionDay: number;  // 14

    // Voice mode
    voiceFailuresBeforeFallback: number;  // 2

    // Session limits
    dailyQuestionLimit: number;      // 30
    retryWrongInSameSession: boolean;  // true

    // Gamification
    streakEnabled: boolean;  // true

    // Inline exercise system (blended learning)
    inline: {
        maxPerDay: number;              // Max inline questions across all surfaces per day
        productionThreshold: number;    // Review # where production phase starts
        clusterWeavingEnabled: boolean; // Weave cluster phrases into scenarios
        skipPenalty: number;            // XP penalty for skipping inline (0 = no penalty)
        quizCardFrequency: number;      // Show quiz card every N cards in swipers
    };
}

/**
 * Default practice configuration
 */
export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
    timeLimits: {
        formal: 90,
        consultative: 30,
        casual: 30,
    },
    xp: {
        correctFast: 10,
        correctSlow: 5,
        partial: 3,
        wrong: -5,
        tooSlow: -3,
        skip: -3,
        reveal: -5,
    },
    maxVariantsPerPhrase: 3,
    daysBetweenVariants: 7,
    switchToOpenProductionDay: 14,
    voiceFailuresBeforeFallback: 2,
    dailyQuestionLimit: 30,
    retryWrongInSameSession: true,
    streakEnabled: true,
    inline: {
        maxPerDay: 15,
        productionThreshold: 4,
        clusterWeavingEnabled: true,
        skipPenalty: 0,
        quizCardFrequency: 4,
    },
};

/**
 * Helper: Get input mode based on register
 */
export function getInputModeForRegister(register: Register): InputMode {
    return register === 'formal' ? 'type' : 'voice';
}

/**
 * Helper: Get time limit based on register
 */
export function getTimeLimitForRegister(register: Register, config = DEFAULT_PRACTICE_CONFIG): number {
    return config.timeLimits[register] || config.timeLimits.consultative;
}

/**
 * Helper: Calculate XP for a question result
 */
export function calculateXp(
    result: QuestionResult,
    isFast: boolean,
    config = DEFAULT_PRACTICE_CONFIG
): number {
    switch (result) {
        case 'correct':
            return isFast ? config.xp.correctFast : config.xp.correctSlow;
        case 'partial':
            return config.xp.partial;
        case 'wrong':
            return config.xp.wrong;
        case 'skipped':
            return config.xp.skip;
        case 'revealed':
            return config.xp.reveal;
        default:
            return 0;
    }
}

/**
 * Helper: Normalize phrase to use as key
 */
export function normalizePhraseKey(phrase: string): string {
    return phrase
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
}
