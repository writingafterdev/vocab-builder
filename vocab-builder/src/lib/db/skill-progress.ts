/**
 * Skill-Based Progress Tracking
 * 
 * Tracks user proficiency across 4 learning skills:
 * - Comprehension: Understanding phrases in context (reading/listening)
 * - Production: Active phrase use in speech (open-ended speaking)
 * - Interaction: Real-time conversational use (turn-based)
 * - Retention: Long-term memory recall (exercises, SRS)
 */

import { getDocument, setDocument } from '@/lib/appwrite/database';
import { Timestamp } from '@/lib/appwrite/timestamp';

// Skill types
export type SkillType = 'comprehension' | 'production' | 'interaction' | 'retention';

// Skill score (1-100 scale)
export interface SkillScore {
    level: number;           // 1-100
    trend: 'up' | 'down' | 'stable';
    lastActivity: any;       // Timestamp
    weeklyChange: number;    // Delta from last week
    totalActivities: number; // Lifetime count
}

// Individual skill event
export interface SkillEvent {
    date: any;              // Timestamp
    skill: SkillType;
    delta: number;          // +/- points earned
    source: string;         // Session type that contributed
    details?: string;       // Optional description
}

// Full skill progress document
export interface SkillProgress {
    userId: string;
    skills: Record<SkillType, SkillScore>;
    history: SkillEvent[];  // Last 100 events
    lastUpdated: any;       // Timestamp
}

// Session type to skill mapping with weights
const SESSION_SKILL_WEIGHTS: Record<string, Partial<Record<SkillType, number>>> = {
    'reading': { comprehension: 0.7, retention: 0.3 },
    'listening': { comprehension: 0.7, retention: 0.3 },
    'open_ended': { production: 0.8, retention: 0.2 },
    'turn_based': { interaction: 0.8, production: 0.2 },
    'exercise': { retention: 0.9, comprehension: 0.1 },
};

/**
 * Initialize empty skill progress for new user
 */
function createEmptyProgress(userId: string): SkillProgress {
    const now = Timestamp.now();
    const emptyScore: SkillScore = {
        level: 10, // Start at beginner level
        trend: 'stable',
        lastActivity: now,
        weeklyChange: 0,
        totalActivities: 0,
    };

    return {
        userId,
        skills: {
            comprehension: { ...emptyScore },
            production: { ...emptyScore },
            interaction: { ...emptyScore },
            retention: { ...emptyScore },
        },
        history: [],
        lastUpdated: now,
    };
}

/**
 * Calculate points earned based on performance
 * @param performance - Score between 0-1 (e.g., accuracy)
 * @param basePoints - Max points for this activity (default 10)
 */
function calculatePoints(performance: number, basePoints: number = 10): number {
    // Scale performance to points, with minimum 1 point for participation
    return Math.max(1, Math.round(performance * basePoints));
}

/**
 * Calculate new level with diminishing returns at higher levels
 * Uses logarithmic scaling to make progress harder at higher levels
 */
function calculateNewLevel(currentLevel: number, pointsEarned: number): number {
    // Diminishing returns: harder to level up as you get higher
    const scalingFactor = 1 - (currentLevel / 150); // Reduces gain at higher levels
    const effectivePoints = pointsEarned * Math.max(0.2, scalingFactor);

    // Level up slowly (roughly 20 perfect sessions to go from 10 to 50)
    const newLevel = currentLevel + (effectivePoints / 10);

    return Math.min(100, Math.max(1, Math.round(newLevel * 10) / 10));
}

/**
 * Calculate trend based on recent history
 */
function calculateTrend(history: SkillEvent[], skill: SkillType): 'up' | 'down' | 'stable' {
    const skillEvents = history.filter(e => e.skill === skill).slice(-10);
    if (skillEvents.length < 3) return 'stable';

    const recentAvg = skillEvents.slice(-3).reduce((sum, e) => sum + e.delta, 0) / 3;
    const olderAvg = skillEvents.slice(0, -3).reduce((sum, e) => sum + e.delta, 0) / Math.max(1, skillEvents.length - 3);

    if (recentAvg > olderAvg * 1.2) return 'up';
    if (recentAvg < olderAvg * 0.8) return 'down';
    return 'stable';
}

/**
 * Update skill progress after a session
 * @param userId - User ID
 * @param sessionType - Type of session (reading, listening, open_ended, turn_based, exercise)
 * @param performance - Score between 0-1 (accuracy, correctness)
 * @param details - Optional description of what was practiced
 */
export async function updateSkillProgress(
    userId: string,
    sessionType: string,
    performance: number,
    details?: string
): Promise<void> {
    // Get existing progress or create new
    let progress = await getDocument('skillProgress', userId) as SkillProgress | null;

    if (!progress) {
        progress = createEmptyProgress(userId);
    }

    // Get skill weights for this session type
    const weights = SESSION_SKILL_WEIGHTS[sessionType] || { retention: 1 };

    // Calculate and apply points to each relevant skill
    const basePoints = calculatePoints(performance);
    const now = Timestamp.now();

    for (const [skill, weight] of Object.entries(weights)) {
        const skillType = skill as SkillType;
        const weightedPoints = basePoints * (weight as number);

        // Update skill score
        const currentScore = progress.skills[skillType];
        const newLevel = calculateNewLevel(currentScore.level, weightedPoints);

        progress.skills[skillType] = {
            level: newLevel,
            trend: 'stable', // Will be recalculated below
            lastActivity: now,
            weeklyChange: currentScore.weeklyChange + weightedPoints,
            totalActivities: currentScore.totalActivities + 1,
        };

        // Add event to history
        progress.history.push({
            date: now,
            skill: skillType,
            delta: weightedPoints,
            source: sessionType,
            details,
        });
    }

    // Recalculate trends for all updated skills
    for (const skill of Object.keys(weights) as SkillType[]) {
        progress.skills[skill].trend = calculateTrend(progress.history, skill);
    }

    // Keep only last 100 events
    progress.history = progress.history.slice(-100);
    progress.lastUpdated = now;

    // Save
    await setDocument('skillProgress', userId, progress as unknown as Record<string, unknown>);
}

/**
 * Get user's skill progress
 */
export async function getSkillProgress(userId: string): Promise<SkillProgress | null> {
    const progress = await getDocument('skillProgress', userId) as SkillProgress | null;

    if (!progress) {
        return null;
    }

    return progress;
}

/**
 * Get skill summary for display
 */
export function getSkillSummary(progress: SkillProgress): {
    overall: number;
    strongest: SkillType;
    weakest: SkillType;
    recommendation: string;
} {
    const skills = progress.skills;
    const entries = Object.entries(skills) as [SkillType, SkillScore][];

    // Calculate overall (weighted average)
    const overall = Math.round(
        entries.reduce((sum, [, score]) => sum + score.level, 0) / 4
    );

    // Find strongest and weakest
    const sorted = entries.sort((a, b) => b[1].level - a[1].level);
    const strongest = sorted[0][0];
    const weakest = sorted[sorted.length - 1][0];

    // Generate recommendation
    const recommendations: Record<SkillType, string> = {
        comprehension: 'Try reading or listening sessions to understand phrases in context.',
        production: 'Practice open-ended speaking to actively use phrases.',
        interaction: 'Start a turn-based conversation to improve real-time usage.',
        retention: 'Complete daily exercises to strengthen long-term memory.',
    };

    return {
        overall,
        strongest,
        weakest,
        recommendation: recommendations[weakest],
    };
}

/**
 * Reset weekly changes (call via cron job every Monday)
 */
export async function resetWeeklyProgress(userId: string): Promise<void> {
    const progress = await getDocument('skillProgress', userId) as SkillProgress | null;
    if (!progress) return;

    for (const skill of Object.keys(progress.skills) as SkillType[]) {
        progress.skills[skill].weeklyChange = 0;
    }

    await setDocument('skillProgress', userId, progress as unknown as Record<string, unknown>);
}
