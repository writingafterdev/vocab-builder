/**
 * User profile domain module
 */
import {
    getDocument,
    queryCollection,
    serverTimestamp,
    updateDocument,
} from '@/lib/appwrite/client-db';
import type { UserSettings } from '@/types';

type UserStats = {
    currentStreak?: number;
    longestStreak?: number;
    lastStudyDate?: { toDate?: () => Date } | Date | null;
    reviewDayCount?: number;
    lastReviewDate?: { toDate?: () => Date } | Date | null;
};

type UserWithStats = {
    stats?: UserStats;
};

export async function updateUserProfile(
    userId: string,
    data: {
        displayName?: string;
        bio?: string;
        username?: string;
        settings?: Partial<UserSettings>;
    }
): Promise<void> {
    const updateData: Record<string, unknown> = { ...data };
    if (data.settings) {
        delete updateData.settings;
        Object.entries(data.settings).forEach(([key, value]) => {
            updateData[`settings.${key}`] = value;
        });
    }

    await updateDocument('users', userId, updateData);
}

export async function checkUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
    const users = await queryCollection('users', {
        where: [{ field: 'username', op: '==', value: username.toLowerCase() }],
        limit: 1,
    });

    if (users.length === 0) return true;
    return users[0].id === currentUserId;
}

export async function updateCommentsUsername(authorId: string, newUsername: string): Promise<void> {
    const comments = await queryCollection('comments', {
        where: [{ field: 'authorId', op: '==', value: authorId }],
    });

    const updatePromises = comments.map((comment) =>
        updateDocument('comments', comment.id, {
            authorUsername: newUsername
        })
    );

    await Promise.all(updatePromises);
}

/**
 * Update user's learning streak
 * Call this when user saves a phrase or completes a practice session
 */
export async function updateUserStreak(userId: string): Promise<void> {
    const userData = await getDocument<UserWithStats>('users', userId);
    if (!userData) return;

    const stats = userData.stats || {};
    const lastStudyDate = stats.lastStudyDate instanceof Date
        ? stats.lastStudyDate
        : stats.lastStudyDate?.toDate?.() || null;
    const currentStreak = stats.currentStreak || 0;
    const longestStreak = stats.longestStreak || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already studied today
    if (lastStudyDate) {
        const lastDate = new Date(lastStudyDate);
        lastDate.setHours(0, 0, 0, 0);

        if (lastDate.getTime() === today.getTime()) {
            // Already studied today, no streak update needed
            return;
        }

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastDate.getTime() === yesterday.getTime()) {
            // Studied yesterday - increment streak
            const newStreak = currentStreak + 1;
            await updateDocument('users', userId, {
                'stats.currentStreak': newStreak,
                'stats.longestStreak': Math.max(newStreak, longestStreak),
                'stats.lastStudyDate': serverTimestamp(),
            });
        } else {
            // Missed day(s) - reset streak to 1
            await updateDocument('users', userId, {
                'stats.currentStreak': 1,
                'stats.lastStudyDate': serverTimestamp(),
            });
        }
    } else {
        // First time studying - start streak at 1
        await updateDocument('users', userId, {
            'stats.currentStreak': 1,
            'stats.lastStudyDate': serverTimestamp(),
        });
    }
}

/**
 * Get and increment review day count for reading/listening alternation
 * Returns the CURRENT day's count (before increment for next day)
 * 
 * Even (0, 2, 4...) = Reading day
 * Odd (1, 3, 5...) = Listening day
 */
export async function getReviewDayCount(userId: string): Promise<number> {
    const userData = await getDocument<UserWithStats>('users', userId);
    if (!userData) return 0;

    const stats = userData.stats || {};
    return stats.reviewDayCount || 0;
}

/**
 * Increment review day count when user starts a practice session
 * Call this once per day when user opens practice
 */
export async function incrementReviewDayCount(userId: string): Promise<number> {
    const userData = await getDocument<UserWithStats>('users', userId);
    if (!userData) return 0;

    const stats = userData.stats || {};
    const lastReviewDate = stats.lastReviewDate instanceof Date
        ? stats.lastReviewDate
        : stats.lastReviewDate?.toDate?.() || null;
    const currentCount = stats.reviewDayCount || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already incremented today
    if (lastReviewDate) {
        const lastDate = new Date(lastReviewDate);
        lastDate.setHours(0, 0, 0, 0);

        if (lastDate.getTime() === today.getTime()) {
            // Already counted today, return current count
            return currentCount;
        }
    }

    // Increment for new day
    const newCount = currentCount + 1;
    await updateDocument('users', userId, {
        'stats.reviewDayCount': newCount,
        'stats.lastReviewDate': serverTimestamp(),
    });

    return newCount;
}

/**
 * Check if today is a listening day (odd review day count)
 */
export async function isListeningDay(userId: string): Promise<boolean> {
    const count = await getReviewDayCount(userId);
    return count % 2 === 1;
}
