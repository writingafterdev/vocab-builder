import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, addDocument } from '@/lib/appwrite/database';
import { XP_CONFIG, type XpSource, type UserStats } from '@/types';

/**
 * POST /api/user/earn-xp
 * Award XP to user after activity completion
 * 
 * Server-side validation:
 * 1. Activity must be valid source
 * 2. Daily caps enforced
 * 3. Score thresholds for bonuses
 */

interface EarnXpRequest {
    source: XpSource;
    metadata?: {
        sessionId?: string;
        score?: number;
        streakDays?: number;
    };
}

// Get today's date string for daily tracking
function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

// Calculate level from total XP
function calculateLevel(totalXp: number): number {
    return Math.floor(totalXp / XP_CONFIG.XP_PER_LEVEL) + 1;
}

// Calculate base XP for a source
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
            return 0; // Calculated separately
        default:
            return 0;
    }
}

// Calculate bonus XP based on score
function getBonusXp(source: XpSource, score?: number): number {
    if (!score) return 0;

    // Only session completions get score bonuses
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

// Get category for daily cap tracking
function getCategory(source: XpSource): 'sessions' | 'phrases' | 'streak' {
    if (source === 'phrase_saved') return 'phrases';
    if (source === 'streak_bonus') return 'streak';
    return 'sessions';
}

export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: EarnXpRequest = await request.json();
        const { source, metadata } = body;

        if (!source) {
            return NextResponse.json({ error: 'Missing source' }, { status: 400 });
        }

        // Get user profile
        const userData = await getDocument('users', userId);
        if (!userData) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
            return NextResponse.json({
                success: false,
                reason: 'daily_cap_reached',
                xpEarned: 0,
                totalXp: stats.xp,
                level: stats.level
            });
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

        // Apply daily cap (don't exceed remaining cap)
        const remainingCap = XP_CONFIG.DAILY_CAP_TOTAL - stats.xpToday;
        totalEarned = Math.min(totalEarned, remainingCap);

        if (totalEarned <= 0) {
            return NextResponse.json({
                success: false,
                reason: 'no_xp_to_award',
                xpEarned: 0,
                totalXp: stats.xp,
                level: stats.level
            });
        }

        // Update stats
        stats.xp += totalEarned;
        stats.xpToday += totalEarned;
        stats.level = calculateLevel(stats.xp);

        // Save updated stats
        await updateDocument('users', userId, { stats });

        // Log transaction
        await addDocument('xpTransactions', {
            userId,
            amount: totalEarned,
            type: 'earn',
            source,
            createdAt: new Date().toISOString(),
            metadata: {
                ...metadata,
                baseXp,
                bonusXp
            }
        });

        console.log(`[XP] User ${userId} earned ${totalEarned} XP (${source})`);

        return NextResponse.json({
            success: true,
            xpEarned: totalEarned,
            baseXp,
            bonusXp,
            totalXp: stats.xp,
            level: stats.level,
            xpToday: stats.xpToday,
            dailyCapRemaining: XP_CONFIG.DAILY_CAP_TOTAL - stats.xpToday
        });

    } catch (error) {
        console.error('[XP] Error earning XP:', error);
        return NextResponse.json(
            { error: 'Failed to award XP', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
