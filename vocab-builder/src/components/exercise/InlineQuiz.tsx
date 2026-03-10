'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { InlineQuestion } from '@/lib/db/types';
import { useInlineExercise } from '@/hooks/useInlineExercise';
import { cn } from '@/lib/utils';

interface InlineQuizProps {
    userId: string;
    contentTopics?: string[];
    /** The actual text content the user is reading (for content-based quiz generation) */
    contentText?: string;
    /** Where this quiz appears — full_article or swipe_reader */
    surface?: 'full_article' | 'swipe_reader';
    /** Called when the user completes or skips the quiz (for blur gate) */
    onComplete?: () => void;
}

/**
 * Collapsible inline quiz for articles.
 * Appears as an editorial callout between paragraphs.
 * Self-contained: fetches its own question and handles submission.
 */
export function InlineQuiz({
    userId,
    contentTopics,
    contentText,
    surface = 'full_article',
    onComplete,
}: InlineQuizProps) {
    const [collapsed, setCollapsed] = useState(false);
    const {
        question,
        isLoading,
        hasAnswered,
        result,
        xpEarned,
        fetchQuestion,
        submitAnswer,
        skip,
    } = useInlineExercise({
        surface,
        contentText,
        contentTopics,
        userId,
    });

    // Fetch question on mount
    useEffect(() => {
        fetchQuestion();
    }, []);

    // Don't render if no question available
    if (!question && !isLoading) return null;

    if (isLoading) {
        return (
            <div className="my-6 border-l-2 border-amber-300 pl-6 py-4">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-amber-600">
                        Preparing a quick check...
                    </span>
                </div>
            </div>
        );
    }

    if (!question) return null;

    const options = question.options || [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="my-8 border-l-2 border-amber-300 bg-amber-50/30"
        >
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-6 py-3 hover:bg-amber-50/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-amber-600">
                        Quick Check
                    </span>
                    <span className="text-[11px] text-neutral-400">
                        — "{question.phrase}"
                    </span>
                </div>
                {collapsed ? (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                ) : (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                )}
            </button>

            {/* Body */}
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-5">
                            {/* Scenario */}
                            <p
                                className="text-[15px] leading-[1.7] text-neutral-700 mb-4"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                {question.scenario}
                            </p>

                            {/* Options */}
                            <div className="space-y-2">
                                {options.map((option, i) => {
                                    const isCorrect = i === question.correctIndex;
                                    const showFeedback = hasAnswered;

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => { submitAnswer(i); onComplete?.(); }}
                                            disabled={hasAnswered}
                                            className={cn(
                                                "w-full text-left text-[13px] leading-snug px-4 py-3 border transition-all duration-200",
                                                !showFeedback && "border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-white",
                                                showFeedback && isCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800",
                                                showFeedback && !isCorrect && "border-neutral-100 text-neutral-400",
                                            )}
                                        >
                                            {option}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Production prompt (for open-text questions) */}
                            {question.prompt && !options.length && (
                                <div className="mt-3">
                                    <p className="text-[13px] text-neutral-600 mb-2">{question.prompt}</p>
                                    <textarea
                                        className="w-full text-[13px] border border-neutral-200 px-3 py-2 resize-none focus:outline-none focus:border-neutral-400"
                                        rows={2}
                                        placeholder="Type your answer..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                submitAnswer((e.target as HTMLTextAreaElement).value);
                                                onComplete?.();
                                            }
                                        }}
                                        disabled={hasAnswered}
                                    />
                                </div>
                            )}

                            {/* Feedback */}
                            <AnimatePresence>
                                {hasAnswered && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100"
                                    >
                                        {result === 'correct' ? (
                                            <>
                                                <Check className="w-4 h-4 text-emerald-500" />
                                                <span className="text-[12px] font-medium text-emerald-600">Correct</span>
                                                {xpEarned > 0 && (
                                                    <span className="text-[11px] font-semibold text-amber-500 ml-1">+{xpEarned} XP</span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <X className="w-4 h-4 text-red-400" />
                                                <span className="text-[12px] text-neutral-600">{question.explanation}</span>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Skip */}
                            {!hasAnswered && (
                                <div className="mt-3 text-right">
                                    <button
                                        onClick={() => { skip(); onComplete?.(); }}
                                        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 hover:text-neutral-700 transition-colors"
                                    >
                                        Skip →
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
