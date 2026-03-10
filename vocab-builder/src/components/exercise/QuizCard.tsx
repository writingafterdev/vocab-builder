'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles } from 'lucide-react';
import type { InlineQuestion } from '@/lib/db/types';
import { cn } from '@/lib/utils';

interface QuizCardProps {
    question: InlineQuestion;
    onAnswer: (answer: number) => void;
    onSkip: () => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
    xpEarned: number;
}

/**
 * Quiz card component for QuoteSwiper and SwipeReader.
 * Matches the card deck aesthetic — same dimensions, white bg, serif text.
 * Binary choice for quote_swiper, 3 options for swipe_reader.
 */
export function QuizCard({
    question,
    onAnswer,
    onSkip,
    hasAnswered,
    result,
    xpEarned,
}: QuizCardProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const options = question.options || [];
    const isBinary = options.length <= 2;

    const handleSelect = (index: number) => {
        if (hasAnswered) return;
        setSelectedIndex(index);
        onAnswer(index);
    };

    return (
        <div
            className="w-full h-[280px] bg-white border border-neutral-200 flex flex-col overflow-hidden"
            style={{
                boxShadow: '0 8px 30px -5px rgba(0,0,0,0.12)',
            }}
        >
            {/* Top Badge */}
            <div className="flex items-center gap-1.5 px-10 md:px-14 pt-5 pb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600">
                    Quick Check
                </span>
                <span className="text-[11px] text-neutral-300 ml-1">
                    — "{question.phrase}"
                </span>
            </div>

            {/* Scenario */}
            <div className="flex-1 px-10 md:px-14 py-3 overflow-hidden">
                <p
                    className="text-[15px] leading-[1.7] text-neutral-700 line-clamp-3"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    {question.scenario}
                </p>

                {/* Options */}
                <div className={cn(
                    "mt-3 gap-2",
                    isBinary ? "flex" : "flex flex-col"
                )}>
                    {options.map((option, i) => {
                        const isSelected = selectedIndex === i;
                        const isCorrect = i === question.correctIndex;
                        const showResult = hasAnswered;

                        return (
                            <button
                                key={i}
                                onClick={() => handleSelect(i)}
                                disabled={hasAnswered}
                                className={cn(
                                    "text-left text-[13px] leading-snug px-4 py-2.5 border transition-all duration-200",
                                    isBinary ? "flex-1" : "w-full",
                                    // Default state
                                    !showResult && !isSelected && "border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50",
                                    // Selected but not yet answered
                                    !showResult && isSelected && "border-neutral-900 bg-neutral-50 text-neutral-900",
                                    // Correct answer revealed
                                    showResult && isCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800",
                                    // Wrong answer selected
                                    showResult && isSelected && !isCorrect && "border-red-300 bg-red-50 text-red-700",
                                    // Unselected options after answer
                                    showResult && !isSelected && !isCorrect && "border-neutral-100 text-neutral-400",
                                )}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-10 md:px-14 py-3 border-t border-neutral-100">
                <AnimatePresence mode="wait">
                    {hasAnswered ? (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2"
                        >
                            {result === 'correct' ? (
                                <>
                                    <Check className="w-4 h-4 text-emerald-500" />
                                    <span className="text-[12px] font-medium text-emerald-600">
                                        Correct
                                    </span>
                                    {xpEarned > 0 && (
                                        <span className="text-[11px] font-semibold text-amber-500 ml-1">
                                            +{xpEarned} XP
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <X className="w-4 h-4 text-red-400" />
                                    <span className="text-[12px] text-red-500">
                                        {question.explanation || 'Not quite'}
                                    </span>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.span
                            key="hint"
                            className="text-[11px] text-neutral-400"
                        >
                            Tap to answer
                        </motion.span>
                    )}
                </AnimatePresence>

                {!hasAnswered && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSkip(); }}
                        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                        Skip →
                    </button>
                )}
            </div>
        </div>
    );
}
