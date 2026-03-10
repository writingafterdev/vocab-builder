'use client';

import { useState, useCallback, useRef } from 'react';
import type { InlineQuestion, ExerciseSurface } from '@/lib/db/types';

interface UseInlineExerciseOptions {
    surface: ExerciseSurface;
    /** The actual text content the user is currently reading (quote text / article section) */
    contentText?: string;
    /** Highlighted phrases from the content (vocab phrases in article/quote) */
    contentTopics?: string[];
    userId: string;
    /** Pre-generated questions from batch API — used before falling back to real-time generation */
    preGeneratedQuestions?: InlineQuestion[];
}

interface UseInlineExerciseReturn {
    question: InlineQuestion | null;
    isLoading: boolean;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
    xpEarned: number;
    fetchQuestion: () => Promise<void>;
    submitAnswer: (answer: number | string) => Promise<void>;
    skip: () => void;
    reset: () => void;
}

// Session-level tracking (persists across component re-renders within same page visit)
const sessionState = {
    quizzesShown: 0,
    skipsCount: 0,
    cardsSinceLastQuiz: 0,
    maxPerSession: 5,
    maxSkips: 3,
    minGap: 3,
};

/** Reset session state (e.g., on page navigation) */
export function resetQuizSession() {
    sessionState.quizzesShown = 0;
    sessionState.skipsCount = 0;
    sessionState.cardsSinceLastQuiz = 0;
}

/** Check if we should show a quiz (respects caps and gaps) */
export function shouldShowQuiz(): boolean {
    // Over session cap
    if (sessionState.quizzesShown >= sessionState.maxPerSession) return false;
    // Too many skips → user doesn't want quizzes
    if (sessionState.skipsCount >= sessionState.maxSkips) return false;
    // Not enough gap since last quiz
    if (sessionState.cardsSinceLastQuiz < sessionState.minGap) return false;
    return true;
}

/** Increment card counter (call on every card/section viewed) */
export function recordCardViewed() {
    sessionState.cardsSinceLastQuiz++;
}

/**
 * Shared hook for inline exercises across all surfaces.
 * Now uses content-based quiz generation — questions are generated
 * from the actual text the user is currently reading.
 */
export function useInlineExercise({
    surface,
    contentText,
    contentTopics,
    userId,
    preGeneratedQuestions,
}: UseInlineExerciseOptions): UseInlineExerciseReturn {
    const [question, setQuestion] = useState<InlineQuestion | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
    const [xpEarned, setXpEarned] = useState(0);
    const fetchedRef = useRef(false);
    const answerStartRef = useRef<number>(0);

    const getHeaders = useCallback(async (): Promise<HeadersInit> => {
        try {
            const { initializeFirebase } = await import('@/lib/firebase');
            const { auth } = await initializeFirebase();
            const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
            return token
                ? { 'Authorization': `Bearer ${token}`, 'x-user-id': userId }
                : { 'x-user-id': userId };
        } catch {
            return { 'x-user-id': userId };
        }
    }, [userId]);

    const fetchQuestion = useCallback(async () => {
        if (fetchedRef.current || isLoading) return;
        fetchedRef.current = true;
        setIsLoading(true);

        try {
            // ── Try pre-generated questions first ──
            if (preGeneratedQuestions && preGeneratedQuestions.length > 0 && contentText) {
                const contentLower = contentText.toLowerCase();
                const match = preGeneratedQuestions.find(q =>
                    contentLower.includes(q.phrase.toLowerCase())
                );
                if (match) {
                    setQuestion({ ...match, surface });
                    answerStartRef.current = Date.now();
                    sessionState.quizzesShown++;
                    sessionState.cardsSinceLastQuiz = 0;
                    setIsLoading(false);
                    return;
                }
            }

            // ── Fallback: real-time content-quiz API ──
            const headers = await getHeaders();

            const res = await fetch('/api/exercise/content-quiz', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentText: contentText || '',
                    surface,
                    highlightedPhrases: contentTopics || [],
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.question) {
                    setQuestion(data.question);
                    answerStartRef.current = Date.now();
                    sessionState.quizzesShown++;
                    sessionState.cardsSinceLastQuiz = 0;
                }
            }
        } catch (error) {
            console.error('Failed to fetch inline exercise:', error);
        } finally {
            setIsLoading(false);
        }
    }, [surface, contentText, contentTopics, userId, isLoading, getHeaders, preGeneratedQuestions]);

    const submitAnswer = useCallback(async (answer: number | string) => {
        if (!question || hasAnswered) return;

        const responseTimeMs = Date.now() - answerStartRef.current;
        const isCorrect = typeof answer === 'number' && answer === question.correctIndex;

        setHasAnswered(true);
        setResult(isCorrect ? 'correct' : 'wrong');
        setXpEarned(isCorrect ? question.xpReward : 0);

        try {
            const headers = await getHeaders();
            await fetch('/api/exercise/submit', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phraseId: question.phraseId,
                    questionType: question.questionType,
                    answer,
                    surface,
                    responseTimeMs,
                }),
            });
        } catch (error) {
            console.error('Failed to submit inline exercise:', error);
        }
    }, [question, hasAnswered, surface, getHeaders]);

    const skip = useCallback(() => {
        setQuestion(null);
        setHasAnswered(false);
        setResult(null);
        sessionState.skipsCount++;
    }, []);

    const reset = useCallback(() => {
        setQuestion(null);
        setIsLoading(false);
        setHasAnswered(false);
        setResult(null);
        setXpEarned(0);
        fetchedRef.current = false;
    }, []);

    return {
        question,
        isLoading,
        hasAnswered,
        result,
        xpEarned,
        fetchQuestion,
        submitAnswer,
        skip,
        reset,
    };
}
