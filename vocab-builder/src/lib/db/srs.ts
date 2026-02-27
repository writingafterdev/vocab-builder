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
    deleteDoc,
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
 * Calculate next SRS values after a review
 * @param currentStep - Current learning step
 * @param interval - Current interval (days)
 * @param easeFactor - Current ease factor
 * @param success - Whether the review was successful
 * @returns New SRS values
 */
export function advanceSRS(
    currentStep: number,
    interval: number,
    easeFactor: number,
    success: boolean
): {
    newStep: number;
    newInterval: number;
    newEaseFactor: number;
    nextReviewDate: Date;
} {
    const learningCycle = DEFAULT_LEARNING_CYCLE;

    let newStep: number;
    let newInterval: number;
    let newEaseFactor = easeFactor;

    if (success) {
        // Advance to next step
        newStep = Math.min(currentStep + 1, learningCycle.intervals.length - 1);
        newInterval = learningCycle.intervals[newStep] || 1;
        // Slightly increase ease factor on success
        newEaseFactor = Math.min(easeFactor + 0.1, 3.0);
    } else {
        // Stay at current step or go back
        newStep = Math.max(currentStep - 1, 0);
        newInterval = learningCycle.intervals[newStep] || 1;
        // Decrease ease factor on failure
        newEaseFactor = Math.max(easeFactor - 0.2, 1.3);
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
    nextReviewDate.setHours(0, 0, 0, 0);

    return {
        newStep,
        newInterval,
        newEaseFactor,
        nextReviewDate
    };
}

/**
 * Get count of phrases saved today by user
 * Accepts either userEmail or userId (Firestore doc ID)
 */
export async function getTodaySaveCount(userIdentifier: string): Promise<number> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    // If it looks like an email, lookup the user doc ID first
    let resolvedUserId = userIdentifier;
    if (userIdentifier.includes('@')) {
        try {
            const usersRef = collection(firestore, 'users');
            const userQuery = query(usersRef, where('email', '==', userIdentifier));
            const userSnapshot = await getDocs(userQuery);
            if (!userSnapshot.empty) {
                resolvedUserId = userSnapshot.docs[0].id;
            } else {
                console.warn('User not found for email:', userIdentifier);
                return 0;
            }
        } catch (error) {
            console.error('Error looking up user:', error);
            return 0;
        }
    }

    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const q = query(
        phrasesRef,
        where('userId', '==', resolvedUserId),
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
    register: 'casual' | 'consultative' | 'formal' = 'consultative',
    nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative' = 'neutral',
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
        register,
        nuance,
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
 * Get phrases due for review (SRS) - NO-GUILT approach
 * Only returns phrases due TODAY, not overdue ones.
 * Overdue phrases are auto-advanced to the next interval date.
 */
export async function getDuePhrases(userId: string, limitCount: number = 20): Promise<SavedPhrase[]> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    // Get today's date boundaries (start and end of day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const startOfToday = Timestamp.fromDate(todayStart);
    const endOfToday = Timestamp.fromDate(todayEnd);

    // Helper function to get time in milliseconds
    const getTimeMillis = (d: any): number => {
        if (!d) return 0;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.getTime === 'function') return d.getTime();
        if (d instanceof Date) return d.getTime();
        if (typeof d === 'number') return d;
        return 0;
    };

    // Calculate next review date based on learning step
    const getNextReviewDate = (currentStep: number): Date => {
        const { intervals } = DEFAULT_LEARNING_CYCLE;
        // Get the interval for the next step (keep same step if missed, just delay)
        const intervalDays = intervals[Math.min(currentStep, intervals.length - 1)] || 1;
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + intervalDays);
        nextDate.setHours(0, 0, 0, 0);
        return nextDate;
    };

    try {
        // Get all phrases that might be due (including overdue for auto-advance)
        // REMOVED orderBy('nextReviewDate') to avoid Composite Index requirement
        const q = query(
            phrasesRef,
            where('userId', '==', userId),
            where('nextReviewDate', '<=', endOfToday),
            limit(100)
        );

        const snapshot = await getDocs(q);
        const allDue = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedPhrase[];

        // Sort in memory instead of DB
        allDue.sort((a, b) => {
            const timeA = getTimeMillis(a.nextReviewDate);
            const timeB = getTimeMillis(b.nextReviewDate);
            return timeA - timeB;
        });

        const todayPhrases: SavedPhrase[] = [];
        const overdueUpdates: Promise<void>[] = [];

        for (const phrase of allDue) {
            const reviewDateMs = getTimeMillis(phrase.nextReviewDate);
            const endMs = todayEnd.getTime();

            // Logic: If it's due today OR overdue, show it.
            // Only strictly future items are excluded (which query handles anyway).
            // We removed the aggressive "auto-advance" logic to show the backlog.
            if (reviewDateMs <= endMs) {
                todayPhrases.push(phrase);
            }
        }

        return todayPhrases.slice(0, limitCount);
    } catch (e) {
        console.warn("Error in getDuePhrases, falling back to simple query", e);

        // Fallback: get all phrases and filter client-side
        // REMOVED orderBy('createdAt') to avoid Composite Index requirement
        const fallbackQ = query(
            phrasesRef,
            where('userId', '==', userId),
            limit(100)
        );
        const snapshot = await getDocs(fallbackQ);
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SavedPhrase[];

        const endMs = todayEnd.getTime();

        return all.filter(p => {
            const reviewMs = getTimeMillis(p.nextReviewDate);
            // Include anything due before the end of today (Overdue + Today)
            return reviewMs > 0 && reviewMs <= endMs;
        })
            .sort((a, b) => { // Sort in memory
                const timeA = getTimeMillis(a.nextReviewDate);
                const timeB = getTimeMillis(b.nextReviewDate);
                // Show oldest/most overdue first
                return timeA - timeB;
            })
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
 * Apply overdue penalty: decrement learningStep by 1 for overdue phrases
 * Call this when fetching due phrases to penalize skipped reviews
 * 
 * @param phraseIds - IDs of overdue phrases to penalize
 */
export async function applyOverduePenalty(phraseIds: string[]): Promise<void> {
    const firestore = await getDbAsync();
    const learningCycle = DEFAULT_LEARNING_CYCLE;

    for (const id of phraseIds) {
        const docRef = doc(firestore, 'savedPhrases', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data() as SavedPhrase;
            const currentStep = data.learningStep || 0;

            // Decrement by 1 (min 0)
            const newStep = Math.max(0, currentStep - 1);

            // Calculate next review date based on new step
            const intervalDays = learningCycle.intervals[newStep] || 1;
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + intervalDays);
            nextDate.setHours(0, 0, 0, 0);

            await updateDoc(docRef, {
                learningStep: newStep,
                nextReviewDate: Timestamp.fromDate(nextDate),
                // Mark that this was penalized
                wasOverdue: true,
            });
        }
    }
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

/**
 * Update a saved phrase's editable fields
 */
export async function updateSavedPhrase(
    phraseId: string,
    updates: {
        meaning?: string;
        context?: string;
        register?: 'casual' | 'consultative' | 'formal';
        nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
        topics?: string[];
    }
): Promise<void> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    await updateDoc(phraseRef, updates);
}

/**
 * Delete a saved phrase (root word) and all its children
 */
export async function deleteSavedPhrase(phraseId: string): Promise<void> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    await deleteDoc(phraseRef);
}

/**
 * Remove a specific child expression from a saved phrase
 */
export async function removeChildExpression(
    phraseId: string,
    childPhrase: string
): Promise<void> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    const phraseDoc = await getDoc(phraseRef);

    if (!phraseDoc.exists()) {
        throw new Error('Phrase not found');
    }

    const data = phraseDoc.data();
    const children = data.children || [];
    const updatedChildren = children.filter(
        (child: { phrase: string }) => child.phrase !== childPhrase
    );

    await updateDoc(phraseRef, { children: updatedChildren });
}

// ============================================================================
// CHILD EXPRESSION SRS FUNCTIONS
// ============================================================================

import type { ChildExpression } from './types';

/**
 * Get all children due for review across all phrases
 * Children are reviewed independently from their parent
 */
export async function getDueChildren(userId: string, limitCount: number = 20): Promise<Array<{
    parentId: string;
    parentPhrase: string;
    child: ChildExpression;
}>> {
    const firestore = await getDbAsync();
    const phrasesRef = collection(firestore, 'savedPhrases');

    // Get today's boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Helper to get time in milliseconds
    const getTimeMillis = (d: any): number => {
        if (!d) return 0;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.getTime === 'function') return d.getTime();
        if (d instanceof Date) return d.getTime();
        return 0;
    };

    try {
        // Get all phrases with children
        const q = query(
            phrasesRef,
            where('userId', '==', userId)
        );

        const snapshot = await getDocs(q);
        const dueChildren: Array<{ parentId: string; parentPhrase: string; child: ChildExpression }> = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const children = data.children || [];

            for (const child of children) {
                const reviewMs = getTimeMillis(child.nextReviewDate);
                const startMs = todayStart.getTime();
                const endMs = todayEnd.getTime();

                // Check triggers:
                // 1. Must be strictly positive (ignore 0/null which means Locked)
                // 2. Must be <= end of today (Includes Today AND Overdue)
                if (reviewMs > 0 && reviewMs <= endMs) {
                    dueChildren.push({
                        parentId: docSnap.id,
                        parentPhrase: data.phrase,
                        child: child as ChildExpression,
                    });
                }
            }
        }

        return dueChildren.slice(0, limitCount);
    } catch (error) {
        console.error('Error getting due children:', error);
        return [];
    }
}

/**
 * Update SRS for a specific child expression after review
 */
export async function updateChildSRS(
    phraseId: string,
    childId: string,
    rating: 'good' | 'again',
    practiceConfig?: {
        register: any;
        relationship: any;
        topic: string;
    }
): Promise<void> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    const phraseDoc = await getDoc(phraseRef);

    if (!phraseDoc.exists()) {
        throw new Error('Phrase not found');
    }

    const data = phraseDoc.data();
    const children = data.children || [];
    const learningCycle = DEFAULT_LEARNING_CYCLE;

    const updatedChildren = children.map((child: ChildExpression) => {
        if (child.id === childId) {
            const currentStep = child.learningStep || 0;

            // If 'good', advance step; if 'again', reset to step 0
            const nextStep = rating === 'good'
                ? Math.min(currentStep + 1, learningCycle.intervals.length - 1)
                : 0;

            const daysToAdd = learningCycle.intervals[nextStep];
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + daysToAdd);
            nextDate.setHours(0, 0, 0, 0);

            return {
                ...child,
                learningStep: nextStep,
                lastReviewDate: new Date(),
                nextReviewDate: nextDate,
                showCount: (child.showCount || 0) + 1,
                ...(practiceConfig ? { lastPracticeConfig: practiceConfig } : {})
            };
        }
        return child;
    });

    await updateDoc(phraseRef, { children: updatedChildren });
}

/**
 * Add a child expression to a saved phrase (from exercise discovery)
 */
export async function addChildToPhrase(
    phraseId: string,
    childData: {
        phrase: string;
        baseForm: string;
        meaning: string;
        type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
        context: string;
        topic: string;
        subtopic?: string;
        register: 'casual' | 'consultative' | 'formal';
        nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    }
): Promise<{ childId: string }> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    const phraseDoc = await getDoc(phraseRef);

    if (!phraseDoc.exists()) {
        throw new Error('Parent phrase not found');
    }

    const data = phraseDoc.data();
    const existingChildren = data.children || [];

    // Check for duplicate by baseForm
    const isDuplicate = existingChildren.some(
        (child: ChildExpression) => child.baseForm === childData.baseForm
    );

    if (isDuplicate) {
        throw new Error('This expression is already saved');
    }

    // Create new child with SRS initialized
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const childId = `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newChild: ChildExpression = {
        id: childId,
        type: childData.type,
        phrase: childData.phrase,
        baseForm: childData.baseForm,
        meaning: childData.meaning,
        context: childData.context,
        sourceType: 'exercise',
        topic: childData.topic,
        subtopic: childData.subtopic,
        register: childData.register,
        nuance: childData.nuance,
        // Initialize SRS
        learningStep: 0,
        nextReviewDate: null, // Locked by default (Validation of Learning Flow)
        lastReviewDate: null,
        showCount: 0,
        practiceCount: 0,
        createdAt: new Date(),
    };

    const updatedChildren = [...existingChildren, newChild];

    await updateDoc(phraseRef, { children: updatedChildren });

    return { childId };
}

// ============================================================================
// GUIDED PRACTICE SRS INTEGRATION
// ============================================================================

import { PracticeMode, DEFAULT_PRACTICE_CONFIG } from './practice-types';

/**
 * Determine practice mode based on phrase age (days since created)
 * - Day 1-14: In-Context (MCQ)
 * - Day 14+: Open Production
 */
export function getPracticeMode(phrase: SavedPhrase): PracticeMode {
    const config = DEFAULT_PRACTICE_CONFIG;

    // Calculate days since phrase was saved
    let createdAt: Date;
    if (phrase.createdAt && typeof (phrase.createdAt as Timestamp).toDate === 'function') {
        createdAt = (phrase.createdAt as Timestamp).toDate();
    } else if (phrase.createdAt instanceof Date) {
        createdAt = phrase.createdAt;
    } else {
        createdAt = new Date();
    }

    const now = new Date();
    const daysSinceCreated = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceCreated >= config.switchToOpenProductionDay
        ? 'open_production'
        : 'in_context';
}

/**
 * Update phrase SRS data after practice
 * @param phraseId - The phrase ID
 * @param result - 'correct' | 'wrong' | 'partial' | 'skipped' | 'revealed'
 * @param isFast - Whether response was within fast threshold
 */
export async function updatePracticeResult(
    phraseId: string,
    result: 'correct' | 'wrong' | 'partial' | 'skipped' | 'revealed',
    isFast: boolean = false,
    practiceConfig?: {
        register: any;
        relationship: any;
        topic: string;
    }
): Promise<void> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    const phraseDoc = await getDoc(phraseRef);

    if (!phraseDoc.exists()) {
        throw new Error('Phrase not found');
    }

    const phrase = phraseDoc.data() as SavedPhrase;
    const currentStep = phrase.learningStep || 0;
    const { intervals } = DEFAULT_LEARNING_CYCLE;

    let newStep: number;
    let nextReviewDate: Date;

    if (result === 'correct') {
        // Move to next step (or stay at max)
        newStep = Math.min(currentStep + 1, intervals.length - 1);

        // If fast, consider doubling the interval boost
        const intervalDays = intervals[newStep] || 1;
        const adjustedDays = isFast ? Math.min(intervalDays * 1.5, intervals[intervals.length - 1]) : intervalDays;

        nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + Math.floor(adjustedDays));
    } else if (result === 'partial') {
        // Stay at same step, normal interval
        newStep = currentStep;
        const intervalDays = intervals[currentStep] || 1;
        nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);
    } else if (result === 'revealed') {
        // Reset to step 0 (start over)
        newStep = 0;
        nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + 1); // Tomorrow
    } else {
        // wrong or skipped - step back one
        newStep = Math.max(0, currentStep - 1);
        const intervalDays = intervals[newStep] || 1;
        nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);
    }

    nextReviewDate.setHours(0, 0, 0, 0);

    // Build update payload
    const updatePayload: any = {
        learningStep: newStep,
        nextReviewDate: Timestamp.fromDate(nextReviewDate),
        lastReviewDate: Timestamp.now(),
        practiceCount: increment(1),
        hasAppearedInExercise: true,
    };

    // Store last practice config (quick reference)
    if (practiceConfig) {
        updatePayload.lastPracticeConfig = practiceConfig;
    }

    await updateDoc(phraseRef, updatePayload);

    // CONTEXT ROTATION: Append used context to practiceHistory
    if (practiceConfig?.topic) {
        try {
            const existingHistory = phrase.practiceHistory?.usedContexts || [];
            const newEntry = {
                topic: practiceConfig.topic,
                register: practiceConfig.register || 'neutral',
                timestamp: new Date().toISOString()
            };
            await updateDoc(phraseRef, {
                'practiceHistory.usedContexts': [...existingHistory, newEntry]
            });
        } catch (historyErr) {
            console.error('Failed to update practiceHistory:', historyErr);
        }
    }

    // CASCADING TRIGGER: Unlock children if successful practice
    if (result === 'correct') {
        try {
            // Unlock 2 children when parent is practiced
            await unlockChildren(phraseId, 2);
        } catch (err) {
            console.error('Failed to unlock children:', err);
        }
    }
}

/**
 * Get phrases grouped by practice mode for a user
 */
export async function getDuePhrasesByMode(
    userId: string,
    limitCount: number = 30
): Promise<{ inContext: SavedPhrase[]; openProduction: SavedPhrase[] }> {
    const duePhrases = await getDuePhrases(userId, limitCount);

    const inContext: SavedPhrase[] = [];
    const openProduction: SavedPhrase[] = [];

    for (const phrase of duePhrases) {
        const mode = getPracticeMode(phrase);
        if (mode === 'in_context') {
            inContext.push(phrase);
        } else {
            openProduction.push(phrase);
        }
    }

    return { inContext, openProduction };
}

/**
 * CASCADING TRIGGER SYSTEM
 * Unlock X children for a parent phrase (Layer 0 -> Layer 1)
 */
export async function unlockChildren(phraseId: string, count: number = 2): Promise<number> {
    const firestore = await getDbAsync();
    const phraseRef = doc(firestore, 'savedPhrases', phraseId);
    const phraseDoc = await getDoc(phraseRef);

    if (!phraseDoc.exists()) return 0;

    const data = phraseDoc.data() as SavedPhrase;
    const children = data.children || [];

    // Find currently locked children (nextReviewDate is null or far future)
    // Note: We used nextReviewDate: null for locked items in addChildToPhrase
    const lockedChildren = children.filter(c => c.nextReviewDate === null);

    if (lockedChildren.length === 0) return 0;

    // Unlock top X
    const toUnlock = lockedChildren.slice(0, count);
    const tomorow = new Date();
    tomorow.setDate(tomorow.getDate() + 1);
    tomorow.setHours(0, 0, 0, 0);

    const updatedChildren = children.map(c => {
        if (toUnlock.find(u => u.id === c.id)) {
            return {
                ...c,
                nextReviewDate: tomorow, // Unlock: Schedule for tomorrow
                learningStep: 0
            };
        }
        return c;
    });

    await updateDoc(phraseRef, { children: updatedChildren });
    console.log(`Unlocked ${toUnlock.length} children for phrase ${phraseId}`);
    return toUnlock.length;
}
