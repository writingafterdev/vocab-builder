/**
 * Speaking Progress Tracking
 * 
 * Tracks user progress in speaking sessions:
 * - Per-session metrics
 * - Phrase-level statistics
 * - Weekly aggregates
 */

import { getDocument, updateDocument, setDocument } from '@/lib/firestore-rest';
import { SpeakingFeedback } from '@/lib/speaking-analysis';
import { Timestamp } from 'firebase/firestore';

export interface SessionRecord {
    date: any; // Timestamp
    type: 'open_ended' | 'turn_based';
    intonationAccuracy: number; // 0-1
    phrasesUsed: number;
    phrasesTotal: number;
    languageFitScore: number; // 1-10
    retryCount: number;
    fluency: 'natural' | 'hesitant' | 'choppy';
}

export interface PhraseStats {
    timesPrompted: number;
    timesUsed: number;
    avgIntonationAccuracy: number;
    lastUsed?: any;
}

export interface WeeklyStats {
    week: string; // e.g., '2026-W05'
    avgIntonation: number;
    phrasesRetention: number;
    sessionsCompleted: number;
}

export interface SpeakingProgress {
    userId: string;
    sessions: SessionRecord[];
    phraseStats: Record<string, PhraseStats>;
    weeklyStats: WeeklyStats[];
    lastUpdated: any;
}

/**
 * Get current week string (e.g., '2026-W05')
 */
function getCurrentWeek(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Calculate intonation accuracy from feedback
 */
function calculateIntonationAccuracy(feedback: SpeakingFeedback): number {
    const keyMoments = feedback.intonation.keyMoments;
    if (keyMoments.length === 0) return 1; // No data = assume good

    const correctMoments = keyMoments.filter(km => km.correct).length;
    return correctMoments / keyMoments.length;
}

/**
 * Save session progress after open-ended completion
 */
export async function saveOpenEndedProgress(
    userId: string,
    feedbacks: SpeakingFeedback[],
    phraseIds: string[],
    totalRetries: number
): Promise<void> {
    // Get existing progress
    let progress = await getDocument('speakingProgress', userId) as SpeakingProgress | null;

    if (!progress) {
        progress = {
            userId,
            sessions: [],
            phraseStats: {},
            weeklyStats: [],
            lastUpdated: Timestamp.now()
        };
    }

    // Calculate session metrics from all feedbacks
    const phrasesUsed = new Set<string>();
    let totalIntonationAccuracy = 0;
    let totalLanguageFit = 0;
    let fluencyCounts = { natural: 0, hesitant: 0, choppy: 0 };

    for (const fb of feedbacks) {
        fb.phrases.filter(p => p.usedCorrectly).forEach(p => phrasesUsed.add(p.phraseId));
        totalIntonationAccuracy += calculateIntonationAccuracy(fb);
        totalLanguageFit += fb.languageFit.score;
        fluencyCounts[fb.fluency]++;
    }

    const avgIntonation = feedbacks.length > 0 ? totalIntonationAccuracy / feedbacks.length : 0;
    const avgLanguageFit = feedbacks.length > 0 ? totalLanguageFit / feedbacks.length : 5;
    const dominantFluency = Object.entries(fluencyCounts)
        .sort((a, b) => b[1] - a[1])[0][0] as 'natural' | 'hesitant' | 'choppy';

    // Create session record
    const sessionRecord: SessionRecord = {
        date: Timestamp.now(),
        type: 'open_ended',
        intonationAccuracy: avgIntonation,
        phrasesUsed: phrasesUsed.size,
        phrasesTotal: phraseIds.length,
        languageFitScore: avgLanguageFit,
        retryCount: totalRetries,
        fluency: dominantFluency
    };

    // Update phrase stats
    for (const phraseId of phraseIds) {
        const existing = progress.phraseStats[phraseId] || {
            timesPrompted: 0,
            timesUsed: 0,
            avgIntonationAccuracy: 0
        };

        const wasUsed = phrasesUsed.has(phraseId);
        existing.timesPrompted++;
        if (wasUsed) {
            existing.timesUsed++;
            existing.lastUsed = Timestamp.now();
        }
        // Rolling average for intonation
        existing.avgIntonationAccuracy = (
            existing.avgIntonationAccuracy * (existing.timesPrompted - 1) + avgIntonation
        ) / existing.timesPrompted;

        progress.phraseStats[phraseId] = existing;
    }

    // Update weekly stats
    const currentWeek = getCurrentWeek();
    let weekStats = progress.weeklyStats.find(w => w.week === currentWeek);

    if (!weekStats) {
        weekStats = {
            week: currentWeek,
            avgIntonation: 0,
            phrasesRetention: 0,
            sessionsCompleted: 0
        };
        progress.weeklyStats.push(weekStats);
    }

    // Rolling average for weekly stats
    const prevCount = weekStats.sessionsCompleted;
    weekStats.sessionsCompleted++;
    weekStats.avgIntonation = (weekStats.avgIntonation * prevCount + avgIntonation) / weekStats.sessionsCompleted;
    weekStats.phrasesRetention = (weekStats.phrasesRetention * prevCount + (phrasesUsed.size / phraseIds.length)) / weekStats.sessionsCompleted;

    // Keep only last 12 weeks
    progress.weeklyStats = progress.weeklyStats.slice(-12);

    // Add session record (keep last 50)
    progress.sessions.push(sessionRecord);
    progress.sessions = progress.sessions.slice(-50);
    progress.lastUpdated = Timestamp.now();

    // Save
    await setDocument('speakingProgress', userId, progress as unknown as Record<string, unknown>);
}

/**
 * Save turn-based session progress
 */
export async function saveTurnBasedProgress(
    userId: string,
    phrasesUsed: string[],
    totalPhrases: number,
    feedback?: SpeakingFeedback
): Promise<void> {
    let progress = await getDocument('speakingProgress', userId) as SpeakingProgress | null;

    if (!progress) {
        progress = {
            userId,
            sessions: [],
            phraseStats: {},
            weeklyStats: [],
            lastUpdated: Timestamp.now()
        };
    }

    const sessionRecord: SessionRecord = {
        date: Timestamp.now(),
        type: 'turn_based',
        intonationAccuracy: feedback ? calculateIntonationAccuracy(feedback) : 0.5,
        phrasesUsed: phrasesUsed.length,
        phrasesTotal: totalPhrases,
        languageFitScore: feedback?.languageFit.score || 5,
        retryCount: 0,
        fluency: feedback?.fluency || 'natural'
    };

    progress.sessions.push(sessionRecord);
    progress.sessions = progress.sessions.slice(-50);
    progress.lastUpdated = Timestamp.now();

    await setDocument('speakingProgress', userId, progress as unknown as Record<string, unknown>);
}

/**
 * Get user's speaking progress
 */
export async function getSpeakingProgress(userId: string): Promise<SpeakingProgress | null> {
    return await getDocument('speakingProgress', userId) as SpeakingProgress | null;
}
