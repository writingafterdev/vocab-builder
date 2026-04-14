'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BookOpen, ChevronDown, Headphones, Volume2 } from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { toast } from 'sonner';
import Link from 'next/link';

import McqInteraction from '@/components/exercise/interactions/McqInteraction';
import ReorderInteraction from '@/components/exercise/interactions/ReorderInteraction';
import HighlightInteraction from '@/components/exercise/interactions/HighlightInteraction';
import RatingInteraction from '@/components/exercise/interactions/RatingInteraction';
import FreeWriteInteraction from '@/components/exercise/interactions/FreeWriteInteraction';
import ABPickInteraction from '@/components/exercise/interactions/ABPickInteraction';
import FillBlankInteraction from '@/components/exercise/interactions/FillBlankInteraction';
import SwipeJudgeInteraction from '@/components/exercise/interactions/SwipeJudgeInteraction';
import MatchPairsInteraction from '@/components/exercise/interactions/MatchPairsInteraction';
import TapPassageInteraction from '@/components/exercise/interactions/TapPassageInteraction';
import CategorySortInteraction from '@/components/exercise/interactions/CategorySortInteraction';
import WordBuilderInteraction from '@/components/exercise/interactions/WordBuilderInteraction';
import ErrorTapFixInteraction from '@/components/exercise/interactions/ErrorTapFixInteraction';
import DialoguePickInteraction from '@/components/exercise/interactions/DialoguePickInteraction';
import MultiBlankInteraction from '@/components/exercise/interactions/MultiBlankInteraction';

import type { AnchorPassage, SessionQuestion, SessionQuestionResult } from '@/lib/db/types';
import { QUESTION_INTERACTION_MAP, QUESTION_TYPE_LABELS, QUESTION_SKILL_MAP, SKILL_AXIS_META } from '@/lib/exercise/config';
import { useTTS } from '@/hooks/use-tts';

// ─── Main Page ────────────────────────────────────────

export default function SessionPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const userId = user?.$id || '';

    // Session data
    const [anchorPassage, setAnchorPassage] = useState<AnchorPassage | null>(null);
    const [questions, setQuestions] = useState<SessionQuestion[]>([]);
    const [vocabWordIds, setVocabWordIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Progress state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [results, setResults] = useState<SessionQuestionResult[]>([]);
    const [completed, setCompleted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showFullPassage, setShowFullPassage] = useState(false);

    // Active question AI evaluation
    const [evaluating, setEvaluating] = useState(false);
    const [activeFeedback, setActiveFeedback] = useState<Record<string, { correct: boolean; feedback: string; suggestion?: string }>>({});

    // Listening mode
    const tts = useTTS();
    const [listenedQuestions, setListenedQuestions] = useState<Set<string>>(new Set());

    // ─── Fetch Session ────────────────────────────────

    useEffect(() => {
        if (!id || !userId) return;
        fetchSession();
    }, [id, userId]);

    const fetchSession = async () => {
        try {
            setLoading(true);
            const token = await user?.getJwt();
            const res = await fetch(`/api/practice/get-session?sessionId=${id}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
            });

            if (!res.ok) throw new Error('Failed to fetch session');

            const data = await res.json();
            const session = data.session;

            setAnchorPassage(session.anchorPassage);
            setQuestions(session.questions || []);
            setVocabWordIds(session.vocabWordIds || []);

            if (session.status?.startsWith('completed')) {
                setCompleted(true);
                setResults(session.results || []);
            } else if (session.status === 'in_progress' && session.partialResults?.length > 0) {
                // Resume: restore saved progress
                setResults(session.partialResults);
                setCurrentIndex(session.currentIndex || session.partialResults.length);
            }
        } catch (err) {
            console.error('Failed to fetch session:', err);
            toast.error('Could not load session');
        } finally {
            setLoading(false);
        }
    };

    // ─── Derived State ────────────────────────────────

    const currentQuestion = questions[currentIndex] || null;
    const totalCorrect = useMemo(() => results.filter(r => r.correct).length, [results]);
    const accuracy = results.length > 0 ? Math.round((totalCorrect / results.length) * 100) : 0;

    // ─── Answer Handlers ──────────────────────────────

    // Fire-and-forget save of partial results to server
    const saveProgress = useCallback((newResults: SessionQuestionResult[], nextIdx: number) => {
        if (!id || !userId) return;
        user?.getJwt().then(token => {
            fetch('/api/practice/save-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    sessionId: id,
                    results: newResults,
                    currentIndex: nextIdx,
                }),
            }).catch(() => {}); // Non-blocking — don't disrupt UX
        }).catch(() => {});
    }, [id, userId, user]);

    const advanceToNext = useCallback((newResults: SessionQuestionResult[]) => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < questions.length) {
            setCurrentIndex(nextIndex);
            setShowFullPassage(false);
            saveProgress(newResults, nextIndex);
        } else {
            handleComplete(newResults);
        }
    }, [currentIndex, questions.length, saveProgress]);

    const recordAnswer = useCallback((questionId: string, correct: boolean, userAnswer?: string) => {
        const q = questions.find(q => q.id === questionId);
        if (!q) return;

        const result: SessionQuestionResult = {
            questionId,
            type: q.type,
            skillAxis: QUESTION_SKILL_MAP[q.type] || q.skillAxis || 'task_achievement',
            correct,
            userAnswer: userAnswer || '',
            timeTaken: 0,
        };

        const newResults = [...results, result];
        setResults(newResults);

        // Auto-advance after feedback delay
        const interaction = QUESTION_INTERACTION_MAP[q.type];
        if (interaction !== 'freewrite') {
            setTimeout(() => {
                advanceToNext(newResults);
            }, correct ? 1500 : 2500);
        }
    }, [questions, results, advanceToNext]);

    const handlePassiveAnswer = useCallback((selectedIndex: number, correct: boolean) => {
        if (!currentQuestion) return;
        recordAnswer(currentQuestion.id, correct, String(selectedIndex));
    }, [currentQuestion, recordAnswer]);

    const handleReorderAnswer = useCallback((orderedItems: string[], correct: boolean) => {
        if (!currentQuestion) return;
        recordAnswer(currentQuestion.id, correct, orderedItems.join(' → '));
    }, [currentQuestion, recordAnswer]);

    const handleFreeWriteAnswer = useCallback(async (text: string) => {
        if (!currentQuestion) return;

        setEvaluating(true);
        try {
            const token = await user?.getJwt();
            const res = await fetch('/api/practice/evaluate-response', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    sessionId: id,
                    questionId: currentQuestion.id,
                    userResponse: text,
                    questionType: currentQuestion.type,
                    prompt: currentQuestion.prompt,
                    passageText: anchorPassage?.text || '',
                    evaluationCriteria: currentQuestion.evaluationCriteria || [],
                    // Production tracking: send expected phrases for usage detection
                    expectedPhrases: currentQuestion.expectedPhrases || [],
                    expectedPhraseIds: currentQuestion.expectedPhraseIds || [],
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const evaluation = data.evaluation;

                setActiveFeedback(prev => ({
                    ...prev,
                    [currentQuestion.id]: {
                        correct: evaluation.pass,
                        feedback: evaluation.feedback || '',
                        suggestion: evaluation.suggestion,
                    },
                }));

                const result: SessionQuestionResult = {
                    questionId: currentQuestion.id,
                    type: currentQuestion.type,
                    skillAxis: QUESTION_SKILL_MAP[currentQuestion.type] || currentQuestion.skillAxis || 'task_achievement',
                    correct: evaluation.pass,
                    userAnswer: text,
                    timeTaken: 0,
                    aiFeedback: evaluation.feedback,
                    // Include production phrase usage results for SRS adjustment
                    phraseUsageResults: evaluation.phraseUsageResults || undefined,
                };

                const newResults = [...results, result];
                setResults(newResults);

                // Auto-advance after showing feedback
                setTimeout(() => {
                    advanceToNext(newResults);
                }, 3000);
            } else {
                recordAnswer(currentQuestion.id, true, text);
                toast.error('Could not evaluate — marked as complete');
            }
        } catch (err) {
            recordAnswer(currentQuestion.id, true, text);
            console.error('Evaluation error:', err);
        } finally {
            setEvaluating(false);
        }
    }, [currentQuestion, anchorPassage, userId, user, id, results, recordAnswer, advanceToNext]);

    // ─── Complete Session ─────────────────────────────

    const handleComplete = async (finalResults: SessionQuestionResult[]) => {
        setCompleted(true);
        setSubmitting(true);

        try {
            const token = await user?.getJwt();
            const correctCount = finalResults.filter(r => r.correct).length;

            await fetch('/api/practice/complete-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    sessionId: id,
                    phraseIds: vocabWordIds,
                    results: finalResults,
                    correctCount,
                    totalQuestions: questions.length,
                }),
            });
        } catch (err) {
            console.error('Failed to submit results:', err);
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Loading ──────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <EditorialLoader label="Preparing your session..." />
            </div>
        );
    }

    if (!anchorPassage) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="text-center">
                    <p className="text-[var(--muted-foreground)] mb-4">Session not found</p>
                    <Link href="/practice" className="text-[var(--foreground)] underline text-sm">
                        Back to Practice
                    </Link>
                </div>
            </div>
        );
    }

    // ─── Completed State ──────────────────────────────

    if (completed) {
        return <CompletionScreen
            accuracy={accuracy}
            totalCorrect={totalCorrect}
            results={results}
            questions={questions}
            onDone={() => router.push('/practice')}
        />;
    }

    // ─── Active Session — Split Screen ────────────────

    const isAnswered = results.some(r => r.questionId === currentQuestion?.id);
    const currentResult = results.find(r => r.questionId === currentQuestion?.id);
    const questionLabel = currentQuestion ? QUESTION_TYPE_LABELS[currentQuestion.type] || '' : '';
    const interactionType = currentQuestion ? QUESTION_INTERACTION_MAP[currentQuestion.type] : null;
    const isFreewrite = interactionType === 'freewrite';
    const isTapPassage = interactionType === 'tap_passage';
    const isListening = currentQuestion?.isListening === true;
    const hasListened = currentQuestion ? listenedQuestions.has(currentQuestion.id) : false;

    // ─── Excerpt grouping ───
    const currentExcerptId = currentQuestion?.excerptId;
    const prevExcerptId = currentIndex > 0 ? questions[currentIndex - 1]?.excerptId : null;
    const isNewExcerpt = currentExcerptId !== prevExcerptId;
    const excerptText = currentQuestion?.excerptText || currentQuestion?.passageReference;
    // Compute which excerpt number we're on (1-indexed)
    const excerptIds = [...new Set(questions.map(q => q.excerptId).filter(Boolean))];
    const currentExcerptNumber = currentExcerptId ? excerptIds.indexOf(currentExcerptId) + 1 : 0;
    const totalExcerpts = excerptIds.length;
    // Count questions within this excerpt
    const questionsInExcerpt = currentExcerptId ? questions.filter(q => q.excerptId === currentExcerptId) : [];
    const questionIndexInExcerpt = currentExcerptId ? questionsInExcerpt.findIndex(q => q.id === currentQuestion?.id) + 1 : 0;

    const handleListenPlay = useCallback(async () => {
        if (!currentQuestion) return;
        const text = currentQuestion.listeningText || currentQuestion.passageReference || currentQuestion.prompt;
        if (!text) return;
        const completed = await tts.play(text);
        if (completed && currentQuestion) {
            setListenedQuestions(prev => new Set(prev).add(currentQuestion.id));
        }
    }, [currentQuestion, tts]);

    return (
        <div className="bg-[var(--background)]">
            {/* ── Top Bar ── */}
            <div className="max-w-2xl w-full mx-auto px-6 pt-4 pb-2 flex items-center justify-between">
                <button
                    onClick={() => router.push('/practice')}
                    className="flex items-center gap-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors min-h-[44px] min-w-[44px]"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Exit</span>
                </button>
                <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums font-medium">
                    {totalExcerpts > 0 ? (
                        <>Passage {currentExcerptNumber} of {totalExcerpts} · Q{questionIndexInExcerpt} of {questionsInExcerpt.length}</>
                    ) : (
                        <>{currentIndex + 1} / {questions.length}</>
                    )}
                </span>
            </div>

            {/* ── Progress Bar ── */}
            <div className="max-w-2xl w-full mx-auto px-6 pb-3">
                {totalExcerpts > 0 ? (
                    <div className="flex gap-2.5">
                        {excerptIds.map((exId, exIdx) => {
                            const groupQs = questions.filter(q => q.excerptId === exId);
                            return (
                                <div key={exId} className="flex gap-0.5 flex-1">
                                    {groupQs.map((q) => {
                                        const result = results.find(r => r.questionId === q.id);
                                        const qIdx = questions.findIndex(qq => qq.id === q.id);
                                        const isCurrent = qIdx === currentIndex;
                                        const axis = QUESTION_SKILL_MAP[q.type] || q.skillAxis || 'task_achievement';
                                        const axisColor = SKILL_AXIS_META[axis]?.color || '#a3a3a3';
                                        return (
                                            <motion.div
                                                key={q.id}
                                                className="flex-1 h-1.5 rounded-full"
                                                animate={{
                                                    backgroundColor: result
                                                        ? result.correct ? '#34d399' : '#f87171'
                                                        : isCurrent ? axisColor : `${axisColor}25`,
                                                    scale: isCurrent ? 1.15 : 1,
                                                }}
                                                transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex gap-1">
                        {questions.map((q, i) => {
                            const result = results.find(r => r.questionId === q.id);
                            const isCurrent = i === currentIndex;
                            const axis = QUESTION_SKILL_MAP[q.type] || q.skillAxis || 'task_achievement';
                            const axisColor = SKILL_AXIS_META[axis]?.color || '#a3a3a3';
                            return (
                                <motion.div
                                    key={q.id}
                                    className="flex-1 h-1.5 rounded-full"
                                    animate={{
                                        backgroundColor: result
                                            ? result.correct ? '#34d399' : '#f87171'
                                            : isCurrent ? axisColor : `${axisColor}25`,
                                        scale: isCurrent ? 1.15 : 1,
                                    }}
                                    transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Content Flow — passage + question + interaction ── */}
            <div>
                <div className="max-w-2xl w-full mx-auto px-6 pb-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentExcerptId || currentQuestion?.id || 'none'}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -16 }}
                            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                        >
                            {/* Sticky excerpt block — stays visible across grouped questions */}
                            {!isListening && !isTapPassage && excerptText && (
                                <div className="mb-5 bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)] border border-[var(--border)] px-5 py-4">
                                    {totalExcerpts > 0 && (
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                                                Passage {currentExcerptNumber}
                                            </span>
                                            <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                                                {questionIndexInExcerpt} of {questionsInExcerpt.length} questions
                                            </span>
                                        </div>
                                    )}
                                    <p
                                        className="text-[15px] leading-[1.9] text-[var(--foreground)] opacity-75"
                                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                                    >
                                        {excerptText}
                                    </p>
                                </div>
                            )}

                            {/* Listening mode — audio player replaces passage */}
                            {isListening && (
                                <div className="mb-5">
                                    <div className="bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)] border border-[var(--border)] px-5 py-5">
                                        <div className="flex items-center gap-4">
                                            <motion.button
                                                onClick={handleListenPlay}
                                                disabled={tts.isLoading}
                                                whileTap={{ scale: 0.95 }}
                                                className={`
                                                    flex items-center justify-center w-14 h-14 rounded-full
                                                    transition-all duration-300 min-h-[44px] min-w-[44px]
                                                    ${tts.isPlaying
                                                        ? 'bg-neutral-900 text-white shadow-lg'
                                                        : tts.isLoading
                                                            ? 'bg-neutral-200 text-neutral-400'
                                                            : 'bg-neutral-900 text-white hover:bg-neutral-700'
                                                    }
                                                `}
                                            >
                                                {tts.isLoading ? (
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                                        className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full"
                                                    />
                                                ) : tts.isPlaying ? (
                                                    <Volume2 className="w-5 h-5" />
                                                ) : (
                                                    <Headphones className="w-5 h-5" />
                                                )}
                                            </motion.button>
                                            <div className="flex-1">
                                                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                                                    {tts.isPlaying ? 'Playing...' : tts.isLoading ? 'Loading...' : hasListened ? 'Play again' : 'Listen first'}
                                                </p>
                                                <p className="text-xs text-[var(--muted-foreground)] mt-0.5 opacity-60">
                                                    {hasListened ? 'You can replay anytime' : 'Tap to hear the passage'}
                                                </p>
                                            </div>
                                            {hasListened && (
                                                <motion.span
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="text-emerald-500 text-xs font-bold"
                                                >
                                                    ✓ Heard
                                                </motion.span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Gate message */}
                                    {!hasListened && !isAnswered && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 1 }}
                                            className="text-center text-[11px] text-[var(--muted-foreground)] mt-3 italic"
                                        >
                                            Listen to the audio to unlock the question
                                        </motion.p>
                                    )}
                                </div>
                            )}

                            {/* Full passage (freewrite only) */}
                            {isFreewrite && anchorPassage && (
                                <div className="mb-6">
                                    <button
                                        onClick={() => setShowFullPassage(!showFullPassage)}
                                        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-2 min-h-[44px]"
                                    >
                                        <BookOpen className="w-3.5 h-3.5" />
                                        Read full passage
                                        <ChevronDown className={`w-3 h-3 transition-transform ${showFullPassage ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {showFullPassage && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                                                className="overflow-hidden"
                                            >
                                                <div className="bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)] border border-[var(--border)] px-6 py-5 mb-6">
                                                    <p className="text-xs text-[var(--muted-foreground)] italic mb-3">
                                                        {anchorPassage.topic} — {anchorPassage.centralClaim}
                                                    </p>
                                                    <div
                                                        className="text-[15px] leading-[1.9] text-[var(--foreground)] opacity-75 whitespace-pre-wrap"
                                                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                                                    >
                                                        {anchorPassage.text}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* ── Question + Interaction (animates within sticky excerpt) ── */}
                            <AnimatePresence mode="wait">
                            <motion.div
                                key={currentQuestion?.id || 'q-none'}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                            >
                            <div className={`pt-2 ${isListening && !hasListened && !isAnswered ? 'opacity-30 pointer-events-none select-none' : ''}`}>
                                {/* Type label */}
                                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted-foreground)] mb-2">
                                    {isListening && '🎧 '}{questionLabel}
                                </p>

                                {/* Prompt */}
                                <p className="text-[15px] text-[var(--foreground)] mb-4 leading-relaxed font-medium">
                                    {currentQuestion?.prompt}
                                </p>

                                {/* Interaction surface */}
                                {interactionType === 'mcq' && (
                                    <McqInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'highlight' && (
                                    <HighlightInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'ab_pick' && (
                                    <ABPickInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'rating' && (
                                    <RatingInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'reorder' && (
                                    <ReorderInteraction question={currentQuestion!} onAnswer={handleReorderAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'freewrite' && (
                                    <FreeWriteInteraction
                                        question={currentQuestion!}
                                        onAnswer={handleFreeWriteAnswer}
                                        disabled={isAnswered}
                                        isEvaluating={evaluating}
                                        feedback={activeFeedback[currentQuestion!.id] || null}
                                    />
                                )}
                                {interactionType === 'fill_blank' && (
                                    <FillBlankInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'swipe_judge' && (
                                    <SwipeJudgeInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'match_pairs' && (
                                    <MatchPairsInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'tap_passage' && (
                                    <TapPassageInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'category_sort' && (
                                    <CategorySortInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'word_builder' && (
                                    <WordBuilderInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'error_tap_fix' && (
                                    <ErrorTapFixInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'dialogue_pick' && (
                                    <DialoguePickInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                                {interactionType === 'multi_blank' && (
                                    <MultiBlankInteraction question={currentQuestion!} onAnswer={handlePassiveAnswer} disabled={isAnswered} />
                                )}
                            </div>

                            {/* Answer feedback */}
                            {isAnswered && currentResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.2 }}
                                    className={`mt-5 px-5 py-3 text-sm ${
                                        currentResult.correct
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-red-50 text-red-700'
                                    }`}
                                >
                                    <span className="font-medium">
                                        {currentResult.correct ? '✓ Correct' : '✗ Not quite'}
                                    </span>
                                    {!currentResult.correct && currentQuestion?.explanation && (
                                        <p className="mt-1 text-[13px] opacity-80">
                                            {currentQuestion.explanation}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                            </motion.div>
                            </AnimatePresence>

                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

// ─── Completion Screen ────────────────────────────────

function CompletionScreen({
    accuracy,
    totalCorrect,
    results,
    questions,
    onDone,
}: {
    accuracy: number;
    totalCorrect: number;
    results: SessionQuestionResult[];
    questions: SessionQuestion[];
    onDone: () => void;
}) {
    const skillBreakdown = useMemo(() => {
        const axes = ['cohesion', 'naturalness', 'task_achievement'] as const;
        return axes.map(axis => {
            const axisResults = results.filter(r => r.skillAxis === axis);
            if (axisResults.length === 0) return null;
            const correct = axisResults.filter(r => r.correct).length;
            return {
                axis,
                label: axis === 'cohesion' ? 'Structure' : axis === 'naturalness' ? 'Expression' : 'Logic',
                correct,
                total: axisResults.length,
                pct: Math.round((correct / axisResults.length) * 100),
            };
        }).filter(Boolean);
    }, [results]);

    return (
        <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-6">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="text-center max-w-sm w-full"
            >
                {/* Big accuracy number */}
                <p
                    className="text-7xl font-light text-[var(--foreground)] mb-2 tabular-nums"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    {accuracy}%
                </p>
                <p className="text-sm text-[var(--muted-foreground)] mb-10">
                    {totalCorrect} of {results.length} correct
                </p>

                {/* Skill breakdown */}
                <div className="space-y-3 mb-10">
                    {skillBreakdown.map((skill) => {
                        if (!skill) return null;
                        return (
                            <motion.div
                                key={skill.axis}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3, duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                                className="flex items-center justify-between py-2"
                            >
                                <span className="text-sm text-[var(--foreground)]">{skill.label}</span>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${skill.pct}%` }}
                                            transition={{ delay: 0.6, duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                                            className={`h-full rounded-full ${
                                                skill.pct >= 70 ? 'bg-emerald-400' : skill.pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                                            }`}
                                        />
                                    </div>
                                    <span className="text-xs text-[var(--muted-foreground)] tabular-nums w-8 text-right">
                                        {skill.correct}/{skill.total}
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Done button */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    onClick={onDone}
                    className="w-full py-4 bg-[var(--foreground)] text-[var(--background)] text-[11px] font-bold uppercase tracking-[0.2em] hover:opacity-90 transition-opacity"
                >
                    Done
                </motion.button>
            </motion.div>
        </div>
    );
}
