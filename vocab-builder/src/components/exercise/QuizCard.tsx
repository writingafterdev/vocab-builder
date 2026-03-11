'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
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
 * Redesigned quiz card with emotion tag, vivid scenarios,
 * and a distinct visual identity from quote cards.
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
    const emotion = (question as any).emotion || '';

    const handleSelect = (index: number) => {
        if (hasAnswered) return;
        setSelectedIndex(index);
        onAnswer(index);
    };

    return (
        <div
            className="w-full h-[280px] bg-neutral-950 text-white flex flex-col overflow-hidden relative"
            style={{
                boxShadow: '0 8px 30px -5px rgba(0,0,0,0.3)',
            }}
        >
            {/* Subtle gradient overlay */}
            <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 30% 0%, rgba(251,191,36,0.6) 0%, transparent 60%)',
                }}
            />

            {/* Top Bar — phrase + emotion tag */}
            <div className="flex items-center justify-between px-8 md:px-12 pt-4 pb-1 relative z-10">
                <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-400">
                        Quick Check
                    </span>
                </div>
                {emotion && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">
                        {emotion}
                    </span>
                )}
            </div>

            {/* Scenario — vivid micro-story */}
            <div className="flex-1 px-8 md:px-12 py-2 overflow-hidden relative z-10">
                <p
                    className="text-[14px] leading-[1.75] text-neutral-300 line-clamp-3"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    {question.scenario}
                </p>

                {/* Options */}
                <div className="mt-3 flex flex-col gap-1.5">
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
                                    "w-full text-left text-[13px] leading-snug px-4 py-2.5 border transition-all duration-200 rounded-sm",
                                    // Default
                                    !showResult && !isSelected && "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-white/5",
                                    // Selected but not answered
                                    !showResult && isSelected && "border-amber-400 bg-amber-400/10 text-white",
                                    // Correct
                                    showResult && isCorrect && "border-emerald-400 bg-emerald-500/15 text-emerald-300",
                                    // Wrong (selected)
                                    showResult && isSelected && !isCorrect && "border-red-400/60 bg-red-500/10 text-red-300",
                                    // Unselected after answer
                                    showResult && !isSelected && !isCorrect && "border-neutral-800 text-neutral-600",
                                )}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Bar — feedback or skip */}
            <div className="flex items-center justify-between px-8 md:px-12 py-3 border-t border-neutral-800 relative z-10">
                <AnimatePresence mode="wait">
                    {hasAnswered ? (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 min-w-0 flex-1 mr-2"
                        >
                            {result === 'correct' ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span className="text-[12px] font-medium text-emerald-400">
                                        Nailed it
                                    </span>
                                    {xpEarned > 0 && (
                                        <span className="text-[11px] font-bold text-amber-400 ml-1">
                                            +{xpEarned} XP
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    <span className="text-[12px] text-neutral-400 truncate">
                                        {question.explanation || 'Not quite'}
                                    </span>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.span
                            key="phrase"
                            className="text-[11px] text-neutral-600 italic"
                        >
                            "{question.phrase}"
                        </motion.span>
                    )}
                </AnimatePresence>

                {!hasAnswered && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSkip(); }}
                        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500 hover:text-white transition-colors flex-shrink-0"
                    >
                        Skip →
                    </button>
                )}
            </div>
        </div>
    );
}
