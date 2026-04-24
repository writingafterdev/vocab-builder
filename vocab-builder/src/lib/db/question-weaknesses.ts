/**
 * Question Type Weakness Tracking
 * 
 * Tracks which question types the user struggles with.
 * One document per user per question type (max 12 docs in MVP).
 * Drives retry card generation and session question weighting.
 */

import crypto from 'crypto';
import { getDocument, setDocument, runQuery, safeDocId } from '@/lib/appwrite/database';
import type { QuestionType, QuestionTypeWeakness, SkillAxis } from '@/lib/db/types';
import { QUESTION_SKILL_MAP, calculateWeight, WEAKNESS_THRESHOLDS } from '@/lib/exercise/config';

const COLLECTION = 'questionWeaknesses';

function weaknessDocId(userId: string, questionType: QuestionType): string {
    const digest = crypto
        .createHash('sha1')
        .update(`${userId}:${questionType}`)
        .digest('hex')
        .slice(0, 30);
    return safeDocId(`qw${digest}`);
}

/**
 * Record the result of a question attempt.
 * Creates or updates the weakness doc for this user + question type.
 */
export async function recordResult(
    userId: string,
    questionType: QuestionType,
    correct: boolean,
    context?: {
        vocabPhrase?: string;
        sessionId?: string;
        feedCardId?: string;
        userAnswer?: string;
    }
): Promise<void> {
    const docId = weaknessDocId(userId, questionType);
    const skillAxis: SkillAxis = QUESTION_SKILL_MAP[questionType] || 'task_achievement';

    try {
        const existing = await getDocument(COLLECTION, docId) as unknown as QuestionTypeWeakness | null;

        if (existing) {
            // Parse recentErrors if stored as JSON string
            let recentErrors = existing.recentErrors || [];
            if (typeof recentErrors === 'string') {
                try { recentErrors = JSON.parse(recentErrors); } catch { recentErrors = []; }
            }

            const wrongCount = correct ? existing.wrongCount : existing.wrongCount + 1;
            const correctCount = correct ? existing.correctCount + 1 : existing.correctCount;
            const weight = calculateWeight(wrongCount, correctCount);

            // Add to recent errors if wrong
            if (!correct && context) {
                recentErrors.unshift({
                    vocabPhrase: context.vocabPhrase,
                    sessionId: context.sessionId,
                    feedCardId: context.feedCardId,
                    userAnswer: context.userAnswer || '',
                    timestamp: new Date().toISOString(),
                });
                // Keep only last N errors
                recentErrors = recentErrors.slice(0, WEAKNESS_THRESHOLDS.maxRecentErrors);
            }

            await setDocument(COLLECTION, docId, {
                userId,
                questionType,
                skillAxis,
                wrongCount,
                correctCount,
                weight,
                lastWrongAt: correct ? existing.lastWrongAt : new Date().toISOString(),
                lastCorrectAt: correct ? new Date().toISOString() : (existing.lastCorrectAt || ''),
                recentErrors: JSON.stringify(recentErrors),
            });
        } else {
            // First time seeing this question type
            const recentErrors = !correct && context ? [{
                vocabPhrase: context.vocabPhrase,
                sessionId: context.sessionId,
                feedCardId: context.feedCardId,
                userAnswer: context.userAnswer || '',
                timestamp: new Date().toISOString(),
            }] : [];

            await setDocument(COLLECTION, docId, {
                userId,
                questionType,
                skillAxis,
                wrongCount: correct ? 0 : 1,
                correctCount: correct ? 1 : 0,
                weight: correct ? 0 : 1,
                lastWrongAt: correct ? '' : new Date().toISOString(),
                lastCorrectAt: correct ? new Date().toISOString() : '',
                recentErrors: JSON.stringify(recentErrors),
            });
        }
    } catch (error) {
        console.error(`[question-weaknesses] Failed to record result for ${questionType}:`, error);
    }
}

/**
 * Get all weakness docs for a user.
 */
export async function getWeaknesses(userId: string): Promise<QuestionTypeWeakness[]> {
    try {
        const docs = await runQuery(
            COLLECTION,
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            20
        ) as unknown as QuestionTypeWeakness[];

        return (docs || []).map(doc => ({
            ...doc,
            recentErrors: typeof doc.recentErrors === 'string'
                ? JSON.parse(doc.recentErrors)
                : (doc.recentErrors || []),
        }));
    } catch (error) {
        console.error('[question-weaknesses] Failed to get weaknesses:', error);
        return [];
    }
}

/**
 * Get the N weakest question types for this user.
 * Only considers types with enough attempts (minAttempts threshold).
 * Returns question type strings sorted by weight descending.
 */
export async function getWeakestTypes(userId: string, count: number = 3): Promise<string[]> {
    const weaknesses = await getWeaknesses(userId);

    return weaknesses
        .filter(w => (w.wrongCount + w.correctCount) >= WEAKNESS_THRESHOLDS.minAttempts)
        .filter(w => w.weight >= WEAKNESS_THRESHOLDS.weak)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, count)
        .map(w => w.questionType);
}

/**
 * Get recent error context for a specific question type (for retry card generation).
 */
export async function getRetryContext(
    userId: string,
    questionType: QuestionType
): Promise<QuestionTypeWeakness['recentErrors']> {
    const docId = weaknessDocId(userId, questionType);

    try {
        const doc = await getDocument(COLLECTION, docId) as unknown as QuestionTypeWeakness | null;
        if (!doc) return [];

        const errors = typeof doc.recentErrors === 'string'
            ? JSON.parse(doc.recentErrors)
            : (doc.recentErrors || []);

        return errors;
    } catch (error) {
        console.error('[question-weaknesses] Failed to get retry context:', error);
        return [];
    }
}
