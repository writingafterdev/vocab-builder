'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
    ExerciseSession,
    ExerciseQuestion,
    QuestionResult,
    SessionResult,
} from '@/lib/db/types';

// Question component imports (will be created)
import StoryIntroQuestion from './questions/story-intro';
import CompleteDialogueQuestion from './questions/complete-dialogue';
import WhatWouldYouSayQuestion from './questions/what-would-you-say';
import ListenSelectQuestion from './questions/listen-select';
import StoryRecallQuestion from './questions/story-recall';
import CompleteTheStoryQuestion from './questions/complete-the-story';
import SpotMistakeQuestion from './questions/spot-mistake';
import TypeWhatYouHearQuestion from './questions/type-what-you-hear';
import ChooseSituationQuestion from './questions/choose-situation';
import FreeResponseQuestion from './questions/free-response';
import RegisterSwapQuestion from './questions/register-swap';

// NEW dedicated question components
import ToneInterpretationQuestion from './questions/tone-interpretation';
import ContrastExposureQuestion from './questions/contrast-exposure';
import RegisterSortingQuestion from './questions/register-sorting';
import MultipleResponseQuestion from './questions/multiple-response';
import ExplainToFriendQuestion from './questions/explain-to-friend';

// GMAT-style question components
import ReadingComprehensionQuestion from './questions/reading-comprehension';
import SentenceCorrectionQuestion from './questions/sentence-correction';
import TextCompletionQuestion from './questions/text-completion';

// Feedback components
import { FeedbackPanel } from './feedback-panel';

interface ExerciseShellProps {
    session: ExerciseSession;
    onComplete: (result: SessionResult) => void | Promise<void>;
    onClose: () => void;
}

const QUESTION_COMPONENTS: Record<string, React.ComponentType<any>> = {
    // NEW System Design.md type names - using dedicated components
    'social_consequence_prediction': CompleteTheStoryQuestion,
    'situation_phrase_matching': WhatWouldYouSayQuestion,
    'tone_interpretation': ToneInterpretationQuestion,        // NEW dedicated
    'contrast_exposure': ContrastExposureQuestion,            // NEW dedicated
    'why_did_they_say': StoryRecallQuestion,
    'appropriateness_judgment': ChooseSituationQuestion,
    'error_detection': SpotMistakeQuestion,
    'fill_gap_mcq': CompleteDialogueQuestion,
    'register_sorting': RegisterSortingQuestion,              // NEW dedicated
    'constrained_production': FreeResponseQuestion,
    'transformation_exercise': RegisterSwapQuestion,
    'dialogue_completion_open': FreeResponseQuestion,
    'scenario_production': FreeResponseQuestion,
    'multiple_response_generation': MultipleResponseQuestion, // NEW dedicated
    'explain_to_friend': ExplainToFriendQuestion,             // NEW dedicated
    'creative_context_use': FreeResponseQuestion,

    // Audio/Story specific
    'story_intro': StoryIntroQuestion,
    'listen_select': ListenSelectQuestion,
    'type_what_you_hear': TypeWhatYouHearQuestion,

    // GMAT-style question types
    'reading_comprehension': ReadingComprehensionQuestion,
    'sentence_correction': SentenceCorrectionQuestion,
    'text_completion': TextCompletionQuestion,

    // OLD names (backward compatibility for existing sessions)
    'complete_dialogue': CompleteDialogueQuestion,
    'what_would_you_say': WhatWouldYouSayQuestion,
    'story_recall': StoryRecallQuestion,
    'complete_the_story': CompleteTheStoryQuestion,
    'spot_mistake': SpotMistakeQuestion,
    'choose_situation': ChooseSituationQuestion,
    'free_response': FreeResponseQuestion,
    'register_swap': RegisterSwapQuestion,
};

export default function ExerciseShell({ session, onComplete, onClose }: ExerciseShellProps) {
    const { user } = useAuth();
    const PROGRESS_KEY = `exercise_progress_${session.id}`;

    // Restore saved progress if available
    const savedProgress = (() => {
        try {
            const raw = sessionStorage.getItem(PROGRESS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    })();

    const [currentIndex, setCurrentIndex] = useState<number>(savedProgress?.currentIndex ?? 0);
    const [lives, setLives] = useState<number>(savedProgress?.lives ?? 3);
    const [totalXp, setTotalXp] = useState<number>(savedProgress?.totalXp ?? 0);
    const [results, setResults] = useState<QuestionResult[]>(savedProgress?.results ?? []);
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; xp: number } | null>(null);
    const [startTime] = useState<number>(savedProgress?.startTime ?? Date.now());

    // Retry queue: wrong questions get added here for a second attempt
    const [allQuestions, setAllQuestions] = useState(session.questions);
    const [retriedIds, setRetriedIds] = useState<Set<string>>(
        new Set(savedProgress?.retriedIds ?? [])
    );

    // AI evaluation result for rich feedback (free-form questions)
    const [aiEvaluation, setAiEvaluation] = useState<any>(null);

    // Track when we are waiting for onComplete to finish saving
    const [isCompleting, setIsCompleting] = useState(false);

    // Save progress to sessionStorage after each state change
    const saveProgress = useCallback(() => {
        try {
            sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({
                currentIndex, lives, totalXp, results, startTime,
                retriedIds: Array.from(retriedIds),
            }));
        } catch { /* quota or private browsing */ }
    }, [currentIndex, lives, totalXp, results, startTime, retriedIds, PROGRESS_KEY]);

    useEffect(() => { saveProgress(); }, [saveProgress]);

    // Clear saved progress helper
    const clearSavedProgress = useCallback(() => {
        try { sessionStorage.removeItem(PROGRESS_KEY); } catch { }
    }, [PROGRESS_KEY]);

    // Warn before accidental navigation away mid-exercise
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    const currentQuestion = allQuestions[currentIndex];
    const progress = allQuestions.length > 0 ? ((currentIndex + 1) / allQuestions.length) * 100 : 0;

    // Find if the current question contains any of the child expressions
    const matchedUsage = useMemo(() => {
        if (!session.usagesIncluded || session.usagesIncluded.length === 0 || !currentQuestion) return null;
        const qText = JSON.stringify(currentQuestion.content).toLowerCase();
        return session.usagesIncluded.find(u => qText.includes(u.usage.phrase.toLowerCase()));
    }, [currentQuestion, session.usagesIncluded]);

    // Guard: empty questions array
    if (allQuestions.length === 0) {
        return (
            <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-2">
                    <span className="text-3xl">⚠️</span>
                </div>
                <h2 className="text-xl font-normal text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                    Session Interrupted
                </h2>
                <p className="text-neutral-500 mb-6 text-sm text-center max-w-xs">
                    This practice session couldn't be loaded or was interrupted. Let's head back to the lobby.
                </p>
                <button
                    onClick={() => {
                        clearSavedProgress();
                        onClose();
                    }}
                    className="bg-neutral-900 text-white px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-800 transition-colors"
                >
                    Back to Lobby
                </button>
            </div>
        );
    }

    const handleAnswer = useCallback((answer: string, correct: boolean, timeTaken: number) => {
        const xpEarned = correct ? currentQuestion.xpReward : 0;

        // Record result
        const result: QuestionResult = {
            questionId: currentQuestion.id,
            correct,
            userAnswer: answer,
            xpEarned,
            timeTaken,
        };
        setResults(prev => [...prev, result]);

        // Update state
        if (correct) {
            setTotalXp(prev => prev + xpEarned);
        } else {
            setLives(prev => Math.max(0, prev - 1));

            // Add wrong question to retry queue (only if not already retried)
            if (!retriedIds.has(currentQuestion.id)) {
                setAllQuestions(prev => [...prev, currentQuestion]);
                setRetriedIds(prev => new Set(prev).add(currentQuestion.id));
            }
        }

        // Show feedback (SRS is updated at session completion in handleNext)
        setLastAnswer({ correct, xp: xpEarned });
        setShowFeedback(true);
    }, [currentQuestion, retriedIds]);

    // Extended answer handler with AI evaluation data
    const handleAnswerWithEvaluation = useCallback((answer: string, correct: boolean, timeTaken: number, evaluationData?: any) => {
        // Store AI evaluation if provided
        if (evaluationData) {
            setAiEvaluation(evaluationData);
        } else {
            setAiEvaluation(null);
        }
        // Call original handler
        handleAnswer(answer, correct, timeTaken);
    }, [handleAnswer]);

    const handleNext = useCallback(async () => {
        if (isCompleting) return;

        if (currentIndex < allQuestions.length - 1) {
            setShowFeedback(false);
            setLastAnswer(null);
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsCompleting(true);
            // Session complete - calculate accuracy (only count original questions)
            const originalQuestionCount = session.questions.length;
            const originalResults = results.slice(0, originalQuestionCount);
            const finalCorrect = originalResults.filter(r => r.correct).length + (lastAnswer?.correct ? 1 : 0);
            const accuracy = Math.round((finalCorrect / originalQuestionCount) * 100);

            // Update SRS for all tested phrases based on session accuracy
            if (user && session.testedPhraseIds?.length > 0) {
                try {
                    const token = await user.getIdToken();
                    const avgTimeTaken = results.reduce((sum, r) => sum + r.timeTaken, 0) / results.length;
                    const isFast = avgTimeTaken <= 5;

                    // Determine result based on accuracy
                    const srsResult = accuracy >= 80 ? 'correct' : accuracy >= 50 ? 'partial' : 'wrong';

                    for (const phraseId of session.testedPhraseIds) {
                        await fetch('/api/user/update-practice-result', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                                'x-user-id': user.uid
                            },
                            body: JSON.stringify({
                                phraseId,
                                result: srsResult,
                                isFast
                            })
                        });
                    }
                } catch (error) {
                    console.error('Failed to update SRS:', error);
                }
            }

            const sessionResult: SessionResult = {
                sessionId: session.id,
                questionsAnswered: allQuestions.length,
                correctAnswers: finalCorrect,
                totalXpEarned: totalXp + (lastAnswer?.xp || 0),
                accuracy,
                timeTaken: Math.round((Date.now() - startTime) / 1000),
                phraseResults: session.testedPhraseIds?.map(id => ({
                    phraseId: id,
                    correct: accuracy >= 80,
                })) || [],
            };
            clearSavedProgress();

            try {
                await onComplete(sessionResult);
            } catch (err) {
                console.error('Session complete error', err);
            } finally {
                setIsCompleting(false);
            }
        }
    }, [currentIndex, allQuestions, results, lastAnswer, totalXp, startTime, session, onComplete, user, isCompleting, clearSavedProgress]);

    // Auto-advance for story_intro
    const handleStoryIntroComplete = useCallback(() => {
        setCurrentIndex(prev => prev + 1);
    }, []);

    // Check for game over
    useEffect(() => {
        if (lives <= 0 && !isCompleting) {
            setIsCompleting(true);
            const sessionResult: SessionResult = {
                sessionId: session.id,
                questionsAnswered: currentIndex,
                correctAnswers: results.filter(r => r.correct).length,
                totalXpEarned: totalXp,
                accuracy: Math.round((results.filter(r => r.correct).length / Math.max(1, currentIndex)) * 100),
                timeTaken: Math.round((Date.now() - startTime) / 1000),
                phraseResults: session.testedPhraseIds?.map(id => ({
                    phraseId: id,
                    correct: false,
                })) || [],
            };
            clearSavedProgress();

            const complete = async () => {
                try {
                    await onComplete(sessionResult);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsCompleting(false);
                }
            };
            complete();
        }
    }, [lives, currentIndex, results, totalXp, startTime, session, onComplete, isCompleting, clearSavedProgress]);

    const QuestionComponent = currentQuestion ? QUESTION_COMPONENTS[currentQuestion.type] : null;

    // Skip unknown question types — auto-advance to next
    if (currentQuestion && !QuestionComponent) {
        console.warn(`Skipping unknown question type: ${currentQuestion.type}`);
        if (currentIndex < allQuestions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            return null;
        }
    }

    // Guard: no current question (shouldn't happen but prevents crash)
    if (!currentQuestion || !QuestionComponent || isCompleting) {
        return (
            <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-4">
                {isCompleting ? (
                    <>
                        <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin"></div>
                        <p className="text-neutral-500 font-medium tracking-wide">Wrapping up session...</p>
                    </>
                ) : (
                    <div className="max-w-md w-full px-6 text-center flex flex-col items-center">
                        <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                            <span className="text-3xl">🎉</span>
                        </div>
                        <h2 className="text-2xl font-normal text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                            Session Complete!
                        </h2>
                        <p className="text-neutral-500 text-sm mb-8">
                            Great job reviewing your vocabulary. What would you like to do next?
                        </p>

                        <div className="flex flex-col w-full gap-3">
                            <button
                                onClick={() => { onClose(); window.location.href = '/'; }}
                                className="w-full bg-neutral-900 text-white px-6 py-3.5 text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                            >
                                Keep Reading
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => { onClose(); window.location.href = '/vocab'; }}
                                className="w-full bg-white text-neutral-900 border border-neutral-200 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-50 transition-colors"
                            >
                                View Your Graph
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full text-neutral-400 px-6 py-3 text-xs font-medium uppercase tracking-[0.08em] hover:text-neutral-600 transition-colors mt-2"
                            >
                                Back to Practice Lobby
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
            {/* Header — minimal with thin progress line */}
            <header className="px-6 pt-6 pb-4">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-neutral-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-neutral-400 hover:text-neutral-900" />
                    </button>

                    {/* Thin progress line */}
                    <div className="flex-1 h-[2px] bg-neutral-200 relative">
                        <div
                            className="absolute inset-y-0 left-0 bg-neutral-900 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Question counter */}
                    <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium tabular-nums">
                        {currentIndex + 1}/{allQuestions.length}
                    </span>
                </div>
            </header>

            {/* Question Area */}
            <main className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentQuestion.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                        className="h-full max-w-5xl mx-auto w-full px-6"
                    >
                        <QuestionComponent
                            question={currentQuestion}
                            storyContext={session.storyContext}
                            onAnswer={currentQuestion.type === 'story_intro' ? handleStoryIntroComplete : handleAnswerWithEvaluation}
                            disabled={showFeedback}
                        />
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Feedback Bar — editorial style */}
            <AnimatePresence>
                {showFeedback && lastAnswer && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className={cn(
                            'border-t max-h-[70vh] overflow-y-auto',
                            aiEvaluation ? 'bg-white border-neutral-200' : (
                                lastAnswer.correct
                                    ? 'bg-white border-neutral-200'
                                    : 'bg-neutral-50 border-neutral-200'
                            )
                        )}
                    >
                        {/* Rich FeedbackPanel for AI-evaluated questions */}
                        {aiEvaluation ? (
                            <div className="p-6">
                                <FeedbackPanel
                                    result={aiEvaluation}
                                    targetPhrase={(currentQuestion.content as any)?.targetPhrase || ''}
                                    expectedRegister={(currentQuestion.content as any)?.register}
                                    expectedNuance={(currentQuestion.content as any)?.nuance}
                                    onContinue={handleNext}
                                />
                            </div>
                        ) : (
                            /* Simple feedback with dynamic explanation/trivia */
                            <div className="px-6 py-5">
                                <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-0.5 shrink-0">
                                            {lastAnswer.correct ? (
                                                <CheckCircle className="w-6 h-6 text-blue-600" />
                                            ) : (
                                                <XCircle className="w-6 h-6 text-neutral-900" />
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-neutral-900">
                                                    {lastAnswer.correct ? 'Correct' : 'Not quite'}
                                                </p>
                                                <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400">
                                                    {lastAnswer.correct ? 'Well done' : 'Keep going'}
                                                </p>
                                            </div>

                                            {/* Rich Explanation / Trivia */}
                                            {!lastAnswer.correct && currentQuestion.explanation && (
                                                <p className="text-sm text-neutral-600 max-w-2xl mt-1 leading-relaxed">
                                                    {currentQuestion.explanation}
                                                </p>
                                            )}
                                            {lastAnswer.correct && currentQuestion.trivia && (
                                                <div className="mt-1 max-w-2xl">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-0.5">
                                                        Did you know?
                                                    </p>
                                                    <p className="text-sm text-neutral-600 leading-relaxed">
                                                        {currentQuestion.trivia}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Child Expression Tip */}
                                            {matchedUsage && (
                                                <div className="mt-2 max-w-2xl bg-indigo-50/50 border border-indigo-100/50 rounded-lg p-3">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-0.5 flex items-center gap-1.5">
                                                        💡 Tip: Related Expression
                                                    </p>
                                                    <p className="text-sm text-neutral-700 leading-relaxed">
                                                        This question uses <strong>&quot;{matchedUsage.usage.phrase}&quot;</strong>,
                                                        a variant of <em>{matchedUsage.parentPhrase}</em>.
                                                        {matchedUsage.usage.type ? ` Often used as a ${matchedUsage.usage.type.replace('_', ' ')}. ` : ' '}
                                                        Useful for your daily communication, you should save it!
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleNext}
                                        className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-neutral-800 transition-colors flex items-center gap-2 self-start md:self-auto shrink-0 mt-2 md:mt-0"
                                    >
                                        Continue
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
