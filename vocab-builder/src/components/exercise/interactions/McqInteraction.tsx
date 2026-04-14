'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface McqInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

/**
 * Multiple-choice interaction — pure answer surface.
 * No prompt, no passage, no feedback. Session page handles all context.
 */
export default function McqInteraction({ question, onAnswer, disabled }: McqInteractionProps) {
    const [selected, setSelected] = useState<number | null>(null);

    const options = question.options || [];
    const correctIndex = question.correctIndex ?? -1;

    const handleTap = useCallback((index: number) => {
        if (disabled || selected !== null) return;
        setSelected(index);
        const isCorrect = index === correctIndex;

        // Brief delay to show feedback state, then report
        setTimeout(() => {
            onAnswer(index, isCorrect);
        }, 400);
    }, [disabled, selected, correctIndex, onAnswer]);

    return (
        <div className="space-y-2">
            {options.map((option, i) => {
                const isSelected = selected === i;
                const isCorrectAnswer = selected !== null && i === correctIndex;
                const isWrongSelection = isSelected && i !== correctIndex;

                return (
                    <motion.button
                        key={i}
                        onClick={() => handleTap(i)}
                        disabled={disabled || selected !== null}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: isWrongSelection ? [1, 0.98, 1] : 1,
                        }}
                        transition={{
                            delay: i * 0.04,
                            duration: 0.25,
                            ease: [0.25, 1, 0.5, 1],
                        }}
                        className={`
                            w-full text-left flex items-center gap-3
                            px-4 py-3.5
                            border transition-colors duration-200
                            min-h-[48px]
                            ${isSelected && i === correctIndex
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : isWrongSelection
                                    ? 'bg-red-50 border-red-300 text-red-700'
                                    : isCorrectAnswer
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                        : selected !== null
                                            ? 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] opacity-50'
                                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--foreground)] active:bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)]'
                            }
                            ${disabled || selected !== null ? 'cursor-default' : 'cursor-pointer'}
                        `}
                    >
                        <span className={`
                            flex items-center justify-center
                            w-6 h-6 text-[11px] font-bold
                            border rounded-full shrink-0
                            transition-colors duration-200
                            ${isSelected && i === correctIndex
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : isWrongSelection
                                    ? 'bg-red-500 border-red-500 text-white'
                                    : isCorrectAnswer
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : selected !== null
                                            ? 'border-[var(--border)] text-[var(--muted-foreground)]'
                                            : 'border-[var(--border)] text-[var(--muted-foreground)]'
                            }
                        `}>
                            {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-[14px] leading-relaxed">
                            {option}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
