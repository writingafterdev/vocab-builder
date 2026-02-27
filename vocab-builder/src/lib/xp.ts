import { getDocument, updateDocument, addDocument } from '@/lib/firestore-rest';
import { XP_CONFIG, type XpSource, type UserStats } from '@/types';

/**
 * Award XP to user (internal utility for server-side use)
 * Can be called directly from other API routes without making HTTP request
 */

function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

function calculateLevel(totalXp: number): number {
    return Math.floor(totalXp / XP_CONFIG.XP_PER_LEVEL) + 1;
}

function getBaseXp(source: XpSource): number {
    switch (source) {
        case 'phrase_saved':
            return XP_CONFIG.PHRASE_SAVED;
        case 'daily_drill_complete':
            return XP_CONFIG.DAILY_DRILL;
        case 'reading_session_complete':
            return XP_CONFIG.READING_SESSION;
        case 'listening_session_complete':
            return XP_CONFIG.LISTENING_SESSION;
        case 'speaking_chunk_complete':
            return XP_CONFIG.SPEAKING_CHUNK;
        case 'streak_bonus':
            return 0;
        default:
            return 0;
    }
}

function getBonusXp(source: XpSource, score?: number): number {
    if (!score) return 0;

    const sessionSources: XpSource[] = [
        'daily_drill_complete',
        'reading_session_complete',
        'listening_session_complete',
        'speaking_chunk_complete'
    ];

    if (!sessionSources.includes(source)) return 0;

    if (score >= XP_CONFIG.SUPER_PERFECT_THRESHOLD) {
        return XP_CONFIG.SUPER_PERFECT_BONUS;
    } else if (score >= XP_CONFIG.PERFECT_THRESHOLD) {
        return XP_CONFIG.PERFECT_BONUS;
    }

    return 0;
}

export interface AwardXpResult {
    success: boolean;
    xpEarned: number;
    baseXp: number;
    bonusXp: number;
    totalXp: number;
    level: number;
    reason?: string;
}

export async function awardXp(
    userId: string,
    source: XpSource,
    metadata?: {
        sessionId?: string;
        score?: number;
        streakDays?: number;
    }
): Promise<AwardXpResult> {
    try {
        // Get user profile
        const userData = await getDocument('users', userId);
        if (!userData) {
            return { success: false, xpEarned: 0, baseXp: 0, bonusXp: 0, totalXp: 0, level: 1, reason: 'user_not_found' };
        }

        const stats: UserStats = (userData.stats as UserStats) || {
            totalPhrases: 0,
            totalComments: 0,
            totalReposts: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastStudyDate: null,
            xp: 0,
            level: 1,
            xpToday: 0,
            xpTodayDate: null,
            redeemedDays: 0
        };

        const today = getTodayString();

        // Reset daily XP if new day
        if (stats.xpTodayDate !== today) {
            stats.xpToday = 0;
            stats.xpTodayDate = today;
        }

        // Check daily cap
        if (stats.xpToday >= XP_CONFIG.DAILY_CAP_TOTAL) {
            return {
                success: false,
                xpEarned: 0,
                baseXp: 0,
                bonusXp: 0,
                totalXp: stats.xp,
                level: stats.level,
                reason: 'daily_cap_reached'
            };
        }

        // Calculate XP
        let baseXp = getBaseXp(source);
        let bonusXp = getBonusXp(source, metadata?.score);

        // Special case: streak bonus
        if (source === 'streak_bonus' && metadata?.streakDays) {
            baseXp = Math.min(
                metadata.streakDays * XP_CONFIG.STREAK_MULTIPLIER,
                XP_CONFIG.STREAK_CAP
            );
        }

        let totalEarned = baseXp + bonusXp;

        // Apply daily cap
        const remainingCap = XP_CONFIG.DAILY_CAP_TOTAL - stats.xpToday;
        totalEarned = Math.min(totalEarned, remainingCap);

        if (totalEarned <= 0) {
            return {
                success: false,
                xpEarned: 0,
                baseXp,
                bonusXp,
                totalXp: stats.xp,
                level: stats.level,
                reason: 'no_xp_to_award'
            };
        }

        // Update stats
        stats.xp += totalEarned;
        stats.xpToday += totalEarned;
        stats.level = calculateLevel(stats.xp);

        await updateDocument('users', userId, { stats });

        // Log transaction
        await addDocument('xpTransactions', {
            userId,
            amount: totalEarned,
            type: 'earn',
            source,
            createdAt: new Date().toISOString(),
            metadata: { ...metadata, baseXp, bonusXp }
        });

        console.log(`[XP] User ${userId} earned ${totalEarned} XP (${source})`);

        return {
            success: true,
            xpEarned: totalEarned,
            baseXp,
            bonusXp,
            totalXp: stats.xp,
            level: stats.level
        };

    } catch (error) {
        console.error('[XP] Error awarding XP:', error);
        return { success: false, xpEarned: 0, baseXp: 0, bonusXp: 0, totalXp: 0, level: 1, reason: 'error' };
    }
}
