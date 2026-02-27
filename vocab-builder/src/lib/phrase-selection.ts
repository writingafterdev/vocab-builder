import { Timestamp } from 'firebase/firestore';
import { SavedPhrase, PassiveExposure } from '@/lib/db/types';

/**
 * Phrase Selection Algorithm for Reading, Listening, and Live Sessions
 * 
 * Scores each phrase based on:
 * - Exposure Score (40%): Fewer sessions = higher priority
 * - Recency Score (25%): More days since last session = higher priority
 * - Step Score (20%): Higher learning step = higher priority
 * - Diversity (15%): Max 3 phrases per topic
 */

type SessionType = 'reading' | 'listening' | 'live';

interface ScoredPhrase {
    phrase: SavedPhrase;
    score: number;
    exposureCount: number;
    daysSinceLastSession: number;
}

const MAX_PHRASES_PER_TOPIC = 3;
const MAX_EXPOSURE_FOR_SCORING = 10; // Cap exposure count for scoring

function getExposureCount(phrase: SavedPhrase, sessionType: SessionType): number {
    const exposure = phrase.passiveExposure;
    if (!exposure) return 0;

    switch (sessionType) {
        case 'reading':
            return exposure.readingSessionCount || 0;
        case 'listening':
            return exposure.listeningSessionCount || 0;
        case 'live':
            return exposure.liveSessionCount || 0;
    }
}

function getLastSessionDate(phrase: SavedPhrase, sessionType: SessionType): Timestamp | undefined {
    const exposure = phrase.passiveExposure;
    if (!exposure) return undefined;

    switch (sessionType) {
        case 'reading':
            return exposure.lastReadingDate;
        case 'listening':
            return exposure.lastListeningDate;
        case 'live':
            return exposure.lastLiveSessionDate;
    }
}

function daysSince(timestamp: Timestamp | undefined): number {
    if (!timestamp) return 365; // Never used = high priority (1 year)

    const now = Date.now();
    const lastDate = timestamp.seconds ? timestamp.seconds * 1000 : Date.now();
    const diffMs = now - lastDate;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function scorePhraseForSession(phrase: SavedPhrase, sessionType: SessionType): ScoredPhrase {
    const exposureCount = getExposureCount(phrase, sessionType);
    const lastSessionDate = getLastSessionDate(phrase, sessionType);
    const daysSinceLastSession = daysSince(lastSessionDate);
    const learningStep = phrase.learningStep || 0;

    // Calculate component scores (0-100 scale)
    const exposureScore = Math.max(0, (MAX_EXPOSURE_FOR_SCORING - exposureCount) / MAX_EXPOSURE_FOR_SCORING * 100);
    const recencyScore = Math.min(100, daysSinceLastSession); // Max 100 days
    const stepScore = Math.min(100, learningStep * 20); // Step 5 = max

    // Weighted total
    const totalScore =
        (exposureScore * 0.4) +
        (recencyScore * 0.25) +
        (stepScore * 0.20);

    // Remaining 15% is applied via diversity constraint, not in score

    return {
        phrase,
        score: totalScore,
        exposureCount,
        daysSinceLastSession,
    };
}

function getTopics(phrase: SavedPhrase): string[] {
    if (phrase.topics && Array.isArray(phrase.topics)) {
        return phrase.topics;
    }
    if (phrase.topic) {
        return Array.isArray(phrase.topic) ? phrase.topic : [phrase.topic];
    }
    return ['general'];
}

/**
 * Select phrases for a passive session (reading, listening, or live)
 * 
 * @param phrases - All eligible phrases
 * @param sessionType - Type of session
 * @param maxCount - Maximum phrases to select
 * @returns Selected phrases with balanced exposure and topic diversity
 */
export function selectPhrasesForSession(
    phrases: SavedPhrase[],
    sessionType: SessionType,
    maxCount: number
): SavedPhrase[] {
    if (phrases.length <= maxCount) {
        return phrases;
    }

    // Score all phrases
    const scoredPhrases = phrases.map(p => scorePhraseForSession(p, sessionType));

    // Sort by score (highest first)
    scoredPhrases.sort((a, b) => b.score - a.score);

    // Select with topic diversity constraint
    const selected: ScoredPhrase[] = [];
    const topicCounts: Record<string, number> = {};

    for (const scored of scoredPhrases) {
        if (selected.length >= maxCount) break;

        const topics = getTopics(scored.phrase);

        // Check if any topic is at max
        const canAdd = topics.every(topic => {
            const count = topicCounts[topic] || 0;
            return count < MAX_PHRASES_PER_TOPIC;
        });

        if (canAdd) {
            selected.push(scored);
            topics.forEach(topic => {
                topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            });
        }
    }

    // If we didn't get enough due to diversity constraints, add more ignoring diversity
    if (selected.length < maxCount) {
        for (const scored of scoredPhrases) {
            if (selected.length >= maxCount) break;
            if (!selected.includes(scored)) {
                selected.push(scored);
            }
        }
    }

    return selected.map(s => s.phrase);
}

/**
 * Get default PassiveExposure object for phrases without tracking
 */
export function getDefaultPassiveExposure(): PassiveExposure {
    return {
        readingSessionCount: 0,
        listeningSessionCount: 0,
        liveSessionCount: 0,
        openEndedSessionCount: 0,
        turnBasedSessionCount: 0,
    };
}
