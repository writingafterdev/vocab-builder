'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number, speedBonus?: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

const TOTAL_TIME = 8; // 8 seconds to answer

/**
 * High-pressure Timed MCQ.
 * Shows a progress bar counting down. Faster answer = more XP bonus.
 */
export function TimedMcqInteraction({ question, onAnswer, hasAnswered }: InteractionProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
    const options = question.options || [];

    // Countdown timer
    useEffect(() => {
        if (hasAnswered) return;
        
        if (timeLeft <= 0) {
            // Auto-fail if time runs out
            handleSelect(-1, 0);
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft(prev => prev - 0.1);
        }, 100);

        return () => clearInterval(timer);
    }, [timeLeft, hasAnswered]);

    const handleSelect = (index: number, currentLeft: number = timeLeft) => {
        if (hasAnswered) return;
        setSelectedIndex(index);
        
        // Calculate speed bonus (max 5xp for instant answer, min 0xp)
        // Only give bonus if they got it right
        const isCorrect = index === question.correctIndex;
        const speedBonus = isCorrect ? Math.floor((currentLeft / TOTAL_TIME) * 5) : 0;
        
        onAnswer(index, speedBonus);
    };

    // Calculate width percentage safe from NaN or negatives
    const progressPct = Math.max(0, Math.min(100, (timeLeft / TOTAL_TIME) * 100));
    const isUrgent = timeLeft < 3;

    return (
        <div className="mt-3 flex flex-col gap-1.5 relative">
            {/* Timer Bar */}
            <div className="absolute -top-3 left-0 right-0 h-1 bg-neutral-900 overflow-hidden rounded-full">
                <motion.div 
                    className={cn(
                        "h-full",
                        isUrgent ? "bg-red-500" : "bg-amber-400"
                    )}
                    initial={{ width: '100%' }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ ease: "linear", duration: 0.1 }}
                />
            </div>

            {/* MCQ Options */}
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
                            "w-full text-left text-[13px] leading-snug px-4 py-2.5 border transition-all duration-200 rounded-sm relative overflow-hidden",
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
    );
}
