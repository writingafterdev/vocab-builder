/**
 * Spaced Repetition System (SRS) domain module
 */
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    increment,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { getDbAsync } from './core';
import type { SavedPhrase, Post } from './types';
import { DEFAULT_LEARNING_CYCLE } from './types';

// Daily limit for phrase saving (optimal learning)
export const DAILY_PHRASE_LIMIT = 15;

/**
 * Get count of phrases saved today by user
 */
export async function getTodaySaveCount(userId: string): Promise<number> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const q = query(
        phrasesRef,
        where('userId', '==', userId),
        where('createdAt', '>=', todayTimestamp)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
}

/**
 * Check if user can save more phrases today
 */
export async function canSavePhraseToday(userId: string): Promise<{ canSave: boolean; saved: number; remaining: number }> {
    const saved = await getTodaySaveCount(userId);
    const remaining = Math.max(0, DAILY_PHRASE_LIMIT - saved);
    return { canSave: remaining > 0, saved, remaining };
}

/**
 * Save a phrase to user's vocabulary bank
 * @throws Error if daily limit reached
 */
export async function savePhrase(
    userId: string,
    phrase: string,
    meaning: string,
    context: string,
    usage: 'spoken' | 'written' | 'neutral' = 'neutral',
    sourcePostId?: string,
    rootWord?: string,
    topics?: string[]
): Promise<{ phraseId: string; totalPhrases: number; todayCount: number }> {
    // Check daily limit first
    const { canSave, saved } = await canSavePhraseToday(userId);
    if (!canSave) {
        throw new Error(`Daily limit reached (${DAILY_PHRASE_LIMIT} phrases/day). Come back tomorrow!`);
    }

    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    const now = Timestamp.now();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Reset to midnight

    const docRef = await addDoc(phrasesRef, {
        userId,
        phrase,
        meaning,
        context,
        usage,
        sourcePostId: sourcePostId || null,
        usedForGeneration: false,
        usageCount: 0,
        createdAt: now,
        learningStep: 0,
        nextReviewDate: Timestamp.fromDate(tomorrow),
        // Contextualized Learning - will be populated async
        contexts: [],
        currentContextIndex: 0,
        // Collocation & Tagging
        rootWord: rootWord || null,
        topics: topics || [],
    });

    const totalQuery = query(phrasesRef, where('userId', '==', userId));
    const totalSnapshot = await getDocs(totalQuery);

    // Update user's learning streak
    const { updateUserStreak } = await import('./users');
    await updateUserStreak(userId);

    return {
        phraseId: docRef.id,
        totalPhrases: totalSnapshot.size,
        todayCount: saved + 1,
    };
}

/**
 * Update mastery level for a specific context of a phrase
 */
export async function updateContextMastery(
    phraseId: string,
    contextId: string,
    newMasteryLevel: number
): Promise<void> {
    const firestore = await getDbAsync();
    const docRef = doc(firestore, 'savedPhrases', phraseId);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        throw new Error('Phrase not found');
    }

    const data = docSnap.data() as SavedPhrase;
    const contexts = data.contexts || [];

    // Find and update the specific context
    const updatedContexts = contexts.map(ctx => {
        if (ctx.id === contextId) {
            return {
                ...ctx,
                masteryLevel: newMasteryLevel,
                lastPracticed: Timestamp.now(),
            };
        }
        return ctx;
    });

    // Check if next context should be unlocked (current context mastered)
    const currentIndex = data.currentContextIndex || 0;
    let newContextIndex = currentIndex;

    if (newMasteryLevel >= 3 && currentIndex < updatedContexts.length - 1) {
        // Unlock next context
        updatedContexts[currentIndex + 1] = {
            ...updatedContexts[currentIndex + 1],
            unlocked: true,
        };
        newContextIndex = currentIndex + 1;
    }

    await updateDoc(docRef, {
        contexts: updatedContexts,
        currentContextIndex: newContextIndex,
    });
}

/**
 * Check if a phrase is fully mastered (Option B: Comprehensive)
 * Requires BOTH:
 * 1. SRS learningStep >= masteryThreshold (6)
 * 2. All unlocked contexts have masteryLevel >= 3
 */
export function isPhraseFullyMastered(phrase: SavedPhrase): boolean {
    const { learningStep, contexts } = phrase;
    const { masteryThreshold } = DEFAULT_LEARNING_CYCLE;

    // Check SRS requirement
    if (learningStep < masteryThreshold) {
        return false;
    }

    // Check context mastery requirement
    const unlockedContexts = (contexts || []).filter(ctx => ctx.unlocked);

    // If no contexts unlocked yet, only SRS matters
    if (unlockedContexts.length === 0) {
        return true;
    }

    // All unlocked contexts must be mastered (masteryLevel >= 3)
    return unlockedContexts.every(ctx => ctx.masteryLevel >= 3);
}

/**
 * Get review type for a learning step
 * Even steps = passive (reading), Odd steps = active (exercises)
 */
export function getReviewType(step: number): 'passive' | 'active' {
    return step % 2 === 0 ? 'passive' : 'active';
}

/**
 * Get phrases due for review (SRS) - returns all due phrases
 */
export async function getDuePhrases(userId: string, limitCount: number = 20): Promise<SavedPhrase[]> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    // Check against END of today (so anything due anytime today shows up now)
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const endOfToday = Timestamp.fromDate(today);

    const q = query(
        phrasesRef,
        where('userId', '==', userId),
        where('nextReviewDate', '<=', endOfToday),
        orderBy('nextReviewDate', 'asc'),
        limit(limitCount)
    );

    try {
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedPhrase[];
    } catch (e) {
        console.warn("Index might be missing for getDuePhrases, falling back to client filtering", e);
        const fallbackQ = query(
            phrasesRef,
            where('userId', '==', userId),
            orderBy('createdAt', 'asc'),
            limit(100)
        );
        const snapshot = await getDocs(fallbackQ);
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedPhrase[];

        // Use standard JS date comparison for fallback
        const endOfTodayMillis = today.getTime();

        const getTimeMillis = (d: any): number => {
            if (!d) return 0;
            if (typeof d.toMillis === 'function') return d.toMillis();
            if (typeof d.getTime === 'function') return d.getTime(); // Handle JS Date
            if (d instanceof Date) return d.getTime();
            if (typeof d === 'number') return d;
            return 0;
        };

        return all.filter(p => p.nextReviewDate && getTimeMillis(p.nextReviewDate) <= endOfTodayMillis)
            .sort((a, b) => getTimeMillis(a.nextReviewDate) - getTimeMillis(b.nextReviewDate))
            .slice(0, limitCount);
    }
}

/**
 * Get due phrases split by review type
 */
export async function getDuePhrasesbyType(userId: string): Promise<{
    passive: SavedPhrase[];
    active: SavedPhrase[];
}> {
    const allDue = await getDuePhrases(userId, 50);

    // Filter out fully mastered phrases (Option B: SRS + Context mastery)
    const notMastered = allDue.filter(p => !isPhraseFullyMastered(p));

    return {
        passive: notMastered.filter(p => getReviewType(p.learningStep) === 'passive'),
        active: notMastered.filter(p => getReviewType(p.learningStep) === 'active'),
    };
}

/**
 * Mark phrases as reviewed - implements SRS interval logic
 */
// Mark phrases as reviewed - implements SRS interval logic
export async function reviewPhrases(phraseIds: string[]): Promise<void> {
    const firestore = await getDbAsync();
    const learningCycle = DEFAULT_LEARNING_CYCLE;
    const now = Timestamp.now();

    for (const id of phraseIds) {
        const docRef = doc(firestore, 'savedPhrases', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data() as SavedPhrase;
            const currentStep = data.learningStep || 0;
            const nextStep = Math.min(currentStep + 1, learningCycle.intervals.length - 1);
            const daysToAdd = learningCycle.intervals[nextStep];
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + daysToAdd);
            nextDate.setHours(0, 0, 0, 0); // Reset to midnight

            await updateDoc(docRef, {
                usedForGeneration: true,
                usageCount: increment(1),
                learningStep: nextStep,
                lastReviewDate: now,
                nextReviewDate: Timestamp.fromDate(nextDate)
            });
        }
    }
}

/**
 * Get all user's saved phrases
 */
export async function getUserPhrases(userId: string, count: number = 50): Promise<SavedPhrase[]> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    const q = query(
        phrasesRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(count)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedPhrase[];
}
