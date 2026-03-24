/**
 * User Weaknesses - Appwrite Data Layer
 * 
 * Tracks user errors from speaking sessions for Daily Drill feature.
 * Each weakness is tracked with severity, occurrences, and improvement.
 */

import { getDocument, setDocument, updateDocument } from '@/lib/appwrite/database';
import { ExtractedWeakness, WeaknessCategory } from '@/lib/speaking-feedback';

// ============================================
// Interfaces
// ============================================

export interface WeaknessEntry {
    id: string;
    category: WeaknessCategory;
    specific: string;
    severity: 1 | 2 | 3;
    examples: string[];
    correction: string;
    explanation: string;
    occurrences: number;
    lastSeen: any; // Timestamp
    lastPracticed?: any;
    improvementScore: number; // 0-100
}

export interface UserWeaknessProfile {
    userId: string;
    weaknesses: WeaknessEntry[];
    lastUpdated: any;
}

// ============================================
// Functions
// ============================================

/**
 * Get user's weakness profile
 */
export async function getUserWeaknesses(userId: string): Promise<UserWeaknessProfile | null> {
    try {
        const doc = await getDocument('userWeaknesses', userId);
        return doc as UserWeaknessProfile | null;
    } catch (error) {
        console.error('[User Weaknesses] Failed to get:', error);
        return null;
    }
}

/**
 * Save or update weaknesses from a session
 */
export async function saveSessionWeaknesses(
    userId: string,
    newWeaknesses: ExtractedWeakness[]
): Promise<void> {
    if (newWeaknesses.length === 0) return;

    const now = new Date().toISOString();
    const existing = await getUserWeaknesses(userId);

    let weaknesses: WeaknessEntry[] = existing?.weaknesses || [];

    for (const newW of newWeaknesses) {
        const existingIndex = weaknesses.findIndex(
            w => w.category === newW.category && w.specific === newW.specific
        );

        if (existingIndex >= 0) {
            // Update existing weakness
            const entry = weaknesses[existingIndex];
            entry.occurrences += 1;
            entry.lastSeen = now;
            entry.severity = Math.max(entry.severity, newW.severity) as 1 | 2 | 3;

            // Add example if not already present
            if (!entry.examples.includes(newW.example)) {
                entry.examples = [...entry.examples.slice(-4), newW.example];
            }
        } else {
            // Add new weakness
            weaknesses.push({
                id: `${newW.category}_${newW.specific}_${Date.now()}`,
                category: newW.category,
                specific: newW.specific,
                severity: newW.severity,
                examples: [newW.example],
                correction: newW.correction,
                explanation: newW.explanation,
                occurrences: 1,
                lastSeen: now,
                improvementScore: 0
            });
        }
    }

    // Keep only the top 20 most recent/severe weaknesses
    weaknesses = weaknesses
        .sort((a, b) => {
            // Sort by severity first, then by lastSeen
            if (b.severity !== a.severity) return b.severity - a.severity;
            const aTime = a.lastSeen?.seconds || 0;
            const bTime = b.lastSeen?.seconds || 0;
            return bTime - aTime;
        })
        .slice(0, 20);

    await setDocument('userWeaknesses', userId, {
        userId,
        weaknesses,
        lastUpdated: now
    });
}

/**
 * Get weaknesses eligible for daily drill
 * - Not practiced in last 24 hours
 * - Improvement score < 80
 */
export async function getDrillEligibleWeaknesses(userId: string): Promise<WeaknessEntry[]> {
    const profile = await getUserWeaknesses(userId);
    if (!profile) return [];

    const oneDayAgo = Date.now() / 1000 - 24 * 60 * 60;

    return profile.weaknesses.filter(w => {
        const lastPracticed = w.lastPracticed?.seconds || 0;
        return lastPracticed < oneDayAgo && w.improvementScore < 80;
    });
}

/**
 * Pick random weaknesses for daily drill
 */
export async function pickDrillWeaknesses(
    userId: string,
    count: number = 2
): Promise<WeaknessEntry[]> {
    const eligible = await getDrillEligibleWeaknesses(userId);
    if (eligible.length === 0) return [];

    // Shuffle and pick
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Update weakness after drill practice
 */
export async function updateWeaknessAfterDrill(
    userId: string,
    weaknessId: string,
    performance: number // 0-100
): Promise<void> {
    const profile = await getUserWeaknesses(userId);
    if (!profile) return;

    const now = new Date().toISOString();
    const weaknesses = profile.weaknesses.map(w => {
        if (w.id === weaknessId) {
            // Blend new performance with existing (weighted average)
            const newScore = Math.round(w.improvementScore * 0.6 + performance * 0.4);
            return {
                ...w,
                lastPracticed: now,
                improvementScore: Math.min(100, newScore)
            };
        }
        return w;
    });

    await setDocument('userWeaknesses', userId, {
        ...profile,
        weaknesses,
        lastUpdated: now
    });
}

/**
 * Check if user has any weaknesses to drill
 */
export async function hasDrillsAvailable(userId: string): Promise<boolean> {
    const eligible = await getDrillEligibleWeaknesses(userId);
    return eligible.length > 0;
}

/**
 * Get weakness statistics for display
 */
export async function getWeaknessStats(userId: string): Promise<{
    total: number;
    byCategory: Record<WeaknessCategory, number>;
    avgImprovement: number;
}> {
    const profile = await getUserWeaknesses(userId);
    if (!profile) {
        return {
            total: 0,
            byCategory: {} as Record<WeaknessCategory, number>,
            avgImprovement: 0
        };
    }

    const byCategory: Record<string, number> = {};
    let totalImprovement = 0;

    profile.weaknesses.forEach(w => {
        byCategory[w.category] = (byCategory[w.category] || 0) + 1;
        totalImprovement += w.improvementScore;
    });

    return {
        total: profile.weaknesses.length,
        byCategory: byCategory as Record<WeaknessCategory, number>,
        avgImprovement: profile.weaknesses.length > 0
            ? Math.round(totalImprovement / profile.weaknesses.length)
            : 0
    };
}
