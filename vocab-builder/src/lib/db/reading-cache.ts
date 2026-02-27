/**
 * Reading Session Cache
 * Stores generated reading articles to avoid regeneration on re-visits
 */
import { getDbAsync } from './core';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    updateDoc,
    Timestamp,
} from 'firebase/firestore';

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
    const firestore = await getDbAsync();
    const sessionsRef = collection(firestore, 'readingSessions');
    const phrasesHash = createPhrasesHash(phraseIds);

    // Look for an uncompleted session with matching phrases from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const q = query(
        sessionsRef,
        where('userId', '==', userId),
        where('phrasesHash', '==', phrasesHash),
        where('completedAt', '==', null),
        where('createdAt', '>=', todayTimestamp),
        orderBy('createdAt', 'desc'),
        limit(1)
    );

    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return null;
        }

        const doc = snapshot.docs[0];
        return {
            id: doc.id,
            ...doc.data(),
        } as ReadingSession;
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
    const firestore = await getDbAsync();
    const sessionsRef = collection(firestore, 'readingSessions');
    const sessionDoc = doc(sessionsRef);

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

    await setDoc(sessionDoc, session);

    return {
        id: sessionDoc.id,
        ...session,
    };
}

/**
 * Update session progress
 */
export async function updateSessionProgress(
    sessionId: string,
    currentQuestionIndex: number,
    correctAnswers: number
): Promise<void> {
    const firestore = await getDbAsync();
    const sessionRef = doc(firestore, 'readingSessions', sessionId);

    await updateDoc(sessionRef, {
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
    const firestore = await getDbAsync();
    const sessionRef = doc(firestore, 'readingSessions', sessionId);

    await updateDoc(sessionRef, {
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
    const firestore = await getDbAsync();
    const sessionRef = doc(firestore, 'readingSessions', sessionId);

    try {
        const snapshot = await getDoc(sessionRef);
        if (!snapshot.exists()) {
            return null;
        }

        return {
            id: snapshot.id,
            ...snapshot.data(),
        } as ReadingSession;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}
