/**
 * User Proficiency - Lexile-based level tracking
 * 
 * Stores user's English proficiency level based on speaking assessment.
 * Used to adapt reading and exercise difficulty.
 */

import { Timestamp } from '@/lib/appwrite/timestamp';
import { getDocument, setDocument, updateDocument } from '@/lib/appwrite/database';

// Proficiency labels shown to users
export type ProficiencyLevel = 'beginner' | 'elementary' | 'intermediate' | 'upper_intermediate' | 'advanced';

export interface UserProficiency {
    userId: string;
    lexileLevel: number;           // 200-1600 (internal)
    proficiencyLabel: ProficiencyLevel;

    // Breakdown scores (0-100 each)
    pronunciationScore: number;
    vocabularyScore: number;
    fluencyScore: number;
    complexityScore: number;

    // Test metadata
    lastTestDate: any;
    testCount: number;

    // History for trend tracking
    levelHistory: Array<{
        date: any;
        level: number;
        source: 'placement_test' | 'session_adjustment';
    }>;
}

// Level ranges for each proficiency label
const LEVEL_RANGES: Record<ProficiencyLevel, [number, number]> = {
    beginner: [200, 500],
    elementary: [501, 800],
    intermediate: [801, 1100],
    upper_intermediate: [1101, 1400],
    advanced: [1401, 1600],
};

/**
 * Convert numeric level to display label
 */
export function getLevelLabel(level: number): ProficiencyLevel {
    if (level <= 500) return 'beginner';
    if (level <= 800) return 'elementary';
    if (level <= 1100) return 'intermediate';
    if (level <= 1400) return 'upper_intermediate';
    return 'advanced';
}

/**
 * Get display name for label
 */
export function getLabelDisplayName(label: ProficiencyLevel): string {
    const names: Record<ProficiencyLevel, string> = {
        beginner: 'Beginner',
        elementary: 'Elementary',
        intermediate: 'Intermediate',
        upper_intermediate: 'Upper Intermediate',
        advanced: 'Advanced',
    };
    return names[label];
}

/**
 * Get user's proficiency from Firestore
 */
export async function getUserProficiency(userId: string): Promise<UserProficiency | null> {
    try {
        const doc = await getDocument('userProficiency', userId);
        return doc as UserProficiency | null;
    } catch {
        return null;
    }
}

/**
 * Save user proficiency after placement test
 */
export async function saveUserProficiency(
    userId: string,
    data: Omit<UserProficiency, 'userId'>
): Promise<void> {
    await setDocument('userProficiency', userId, {
        userId,
        ...data,
    });
}

/**
 * Initialize default proficiency for new user
 */
export function getDefaultProficiency(): Omit<UserProficiency, 'userId'> {
    return {
        lexileLevel: 800,
        proficiencyLabel: 'intermediate',
        pronunciationScore: 50,
        vocabularyScore: 50,
        fluencyScore: 50,
        complexityScore: 50,
        lastTestDate: null,
        testCount: 0,
        levelHistory: [],
    };
}

/**
 * Adjust level based on session performance
 * Returns new level if changed, null otherwise
 */
export async function updateLevelFromPerformance(
    userId: string,
    accuracy: number
): Promise<number | null> {
    const proficiency = await getUserProficiency(userId);
    if (!proficiency) return null;

    let newLevel = proficiency.lexileLevel;

    // High performance: increase level
    if (accuracy >= 0.85 && proficiency.lexileLevel < 1500) {
        newLevel = Math.min(1600, proficiency.lexileLevel + 20);
    }
    // Low performance: decrease level
    else if (accuracy < 0.50 && proficiency.lexileLevel > 300) {
        newLevel = Math.max(200, proficiency.lexileLevel - 15);
    }
    // No change
    else {
        return null;
    }

    // Update if changed
    if (newLevel !== proficiency.lexileLevel) {
        const now = Timestamp.now();
        await updateDocument('userProficiency', userId, {
            lexileLevel: newLevel,
            proficiencyLabel: getLevelLabel(newLevel),
            levelHistory: [
                ...proficiency.levelHistory,
                { date: now, level: newLevel, source: 'session_adjustment' }
            ],
        });
        return newLevel;
    }

    return null;
}

/**
 * Get content generation guidance based on level
 */
export function getLevelGuidance(level: number): string {
    if (level <= 500) {
        return `Write for BEGINNER level (Lexile 200-500):
- Use simple sentences (5-10 words max)
- Stick to present tense mostly
- Use common, everyday vocabulary
- Avoid idioms and phrasal verbs
- Repeat key words for reinforcement`;
    }

    if (level <= 800) {
        return `Write for ELEMENTARY level (Lexile 500-800):
- Use simple to moderate sentences (8-15 words)
- Mix present and past tense
- Use common vocabulary with some variety
- Include 1-2 simple idioms if appropriate
- Keep paragraphs short`;
    }

    if (level <= 1100) {
        return `Write for INTERMEDIATE level (Lexile 800-1100):
- Use varied sentence structures
- Mix all tenses naturally
- Include idioms and phrasal verbs
- Use topic-specific vocabulary
- Create engaging narrative flow`;
    }

    if (level <= 1400) {
        return `Write for UPPER-INTERMEDIATE level (Lexile 1100-1400):
- Use complex sentences with subordinate clauses
- Include nuanced vocabulary
- Use idiomatic expressions naturally
- Add some formal/professional register
- Include subtle humor or cultural references`;
    }

    return `Write for ADVANCED level (Lexile 1400-1600):
- Use sophisticated sentence structures
- Include advanced vocabulary and collocations
- Use nuanced, context-dependent expressions
- Apply varied registers (formal/informal)
- Include complex ideas and arguments`;
}
