/**
 * Reading Session Cache
 * Stores generated reading articles to avoid regeneration on re-visits
 */
import {
    addDocument,
    getDocument,
    queryCollection,
    updateDocument,
} from '@/lib/appwrite/client-db';
import { Timestamp } from '@/lib/appwrite/timestamp';

interface ComprehensionQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    targetPhrase: string;
}

interface GeneratedArticle {
    title: string;
    content: string;
    questions: ComprehensionQuestion[];
}

export interface ReadingSession {
    id: string;
    userId: string;
    phraseIds: string[];
    phrasesHash: string; // Hash to detect if phrases changed
    article: GeneratedArticle;
    createdAt: Timestamp;
    completedAt: Timestamp | null;
    currentQuestionIndex: number;
    correctAnswers: number;
}

/**
 * Create a hash from phrase IDs to detect changes
 */
function createPhrasesHash(phraseIds: string[]): string {
    const sorted = [...phraseIds].sort();
    return sorted.join('|');
}

/**
 * Get an existing reading session for the given phrases, or return null
 */
export async function getExistingSession(
    userId: string,
    phraseIds: string[]
): Promise<ReadingSession | null> {
    const phrasesHash = createPhrasesHash(phraseIds);

    // Look for an uncompleted session with matching phrases from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    try {
        const sessions = await queryCollection<ReadingSession>('readingSessions', {
            where: [
                { field: 'userId', op: '==', value: userId },
                { field: 'phrasesHash', op: '==', value: phrasesHash },
                { field: 'completedAt', op: '==', value: null },
                { field: 'createdAt', op: '>=', value: todayTimestamp },
            ],
            orderBy: [{ field: 'createdAt', direction: 'desc' }],
            limit: 1,
        });

        if (sessions.length === 0) {
            return null;
        }

        return sessions[0];
    } catch (error) {
        console.error('Error getting existing session:', error);
        return null;
    }
}

/**
 * Create a new reading session with the generated article
 */
export async function createReadingSession(
    userId: string,
    phraseIds: string[],
    article: GeneratedArticle
): Promise<ReadingSession> {
    const session: Omit<ReadingSession, 'id'> = {
        userId,
        phraseIds,
        phrasesHash: createPhrasesHash(phraseIds),
        article,
        createdAt: Timestamp.now(),
        completedAt: null,
        currentQuestionIndex: 0,
        correctAnswers: 0,
    };

    return addDocument<ReadingSession>('readingSessions', session);
}

/**
 * Update session progress
 */
export async function updateSessionProgress(
    sessionId: string,
    currentQuestionIndex: number,
    correctAnswers: number
): Promise<void> {
    await updateDocument('readingSessions', sessionId, {
        currentQuestionIndex,
        correctAnswers,
    });
}

/**
 * Mark session as completed
 */
export async function completeReadingSession(
    sessionId: string,
    correctAnswers: number
): Promise<void> {
    await updateDocument('readingSessions', sessionId, {
        completedAt: Timestamp.now(),
        correctAnswers,
    });
}

/**
 * Get a session by ID
 */
export async function getSessionById(
    sessionId: string
): Promise<ReadingSession | null> {
    try {
        return getDocument<ReadingSession>('readingSessions', sessionId);
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

/**
 * Get recent reading sessions
 */
export async function getRecentReadingSessions(
    userId: string,
    limitCount: number = 5
): Promise<ReadingSession[]> {
    try {
        return queryCollection<ReadingSession>('readingSessions', {
            where: [{ field: 'userId', op: '==', value: userId }],
            orderBy: [{ field: 'createdAt', direction: 'desc' }],
            limit: limitCount,
        });
    } catch (error) {
        console.error('Error getting recent sessions:', error);
        return [];
    }
}
