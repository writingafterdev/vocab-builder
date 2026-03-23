/**
 * User profile domain module
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    serverTimestamp,
} from '@/lib/firebase/firestore';
import { getDbAsync } from './core';
import type { UserSettings } from '@/types';

export async function updateUserProfile(
    userId: string,
    data: {
        displayName?: string;
        bio?: string;
        username?: string;
        settings?: Partial<UserSettings>;
    }
): Promise<void> {
    const firestore = await getDbAsync();
    const userRef = doc(firestore, 'users', userId);

    const updateData: Record<string, unknown> = { ...data };
    if (data.settings) {
        delete updateData.settings;
        Object.entries(data.settings).forEach(([key, value]) => {
            updateData[`settings.${key}`] = value;
        });
    }

    await updateDoc(userRef, updateData);
}

export async function checkUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
    const firestore = await getDbAsync();
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('username', '==', username.toLowerCase()));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return true;
    return snapshot.docs[0].id === currentUserId;
}

export async function updateCommentsUsername(authorId: string, newUsername: string): Promise<void> {
    const firestore = await getDbAsync();
    const commentsRef = collection(firestore, 'comments');
    const q = query(commentsRef, where('authorId', '==', authorId));
    const snapshot = await getDocs(q);

    const updatePromises = snapshot.docs.map((docSnapshot) =>
        updateDoc(doc(firestore, 'comments', docSnapshot.id), {
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
    const firestore = await getDbAsync();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const stats = userData.stats || {};
    const lastStudyDate = stats.lastStudyDate?.toDate?.() || null;
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
            await updateDoc(userRef, {
                'stats.currentStreak': newStreak,
                'stats.longestStreak': Math.max(newStreak, longestStreak),
                'stats.lastStudyDate': serverTimestamp(),
            });
        } else {
            // Missed day(s) - reset streak to 1
            await updateDoc(userRef, {
                'stats.currentStreak': 1,
                'stats.lastStudyDate': serverTimestamp(),
            });
        }
    } else {
        // First time studying - start streak at 1
        await updateDoc(userRef, {
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
    const firestore = await getDbAsync();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return 0;

    const userData = userSnap.data();
    const stats = userData.stats || {};
    return stats.reviewDayCount || 0;
}

/**
 * Increment review day count when user starts a practice session
 * Call this once per day when user opens practice
 */
export async function incrementReviewDayCount(userId: string): Promise<number> {
    const firestore = await getDbAsync();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return 0;

    const userData = userSnap.data();
    const stats = userData.stats || {};
    const lastReviewDate = stats.lastReviewDate?.toDate?.() || null;
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
    await updateDoc(userRef, {
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

