'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface RatingInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

const RATING_LABELS = ['Solid', 'Has holes', 'Falls apart'];

/**
 * 3-point rating scale — pure answer surface.
 * Used for: rate_argument (how strong is this reasoning?)
 */
export default function RatingInteraction({ question, onAnswer, disabled }: RatingInteractionProps) {
    const [selected, setSelected] = useState<number | null>(null);

    const options = question.options?.length === 3 ? question.options : RATING_LABELS;
    const correctIndex = question.correctIndex ?? -1;

    const handleSelect = useCallback((index: number) => {
        if (disabled || selected !== null) return;
        setSelected(index);
        const isCorrect = index === correctIndex;

        setTimeout(() => {
            onAnswer(index, isCorrect);
        }, 500);
    }, [disabled, selected, correctIndex, onAnswer]);

    return (
        <div className="flex gap-2">
            {options.map((label, i) => {
                const isSelected = selected === i;
                const isCorrectAnswer = selected !== null && i === correctIndex;
                const isWrongSelection = isSelected && i !== correctIndex;

                return (
                    <motion.button
                        key={i}
                        onClick={() => handleSelect(i)}
                        disabled={disabled || selected !== null}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                        className={`
                            flex-1 py-4 px-3
                            text-center text-sm font-medium
                            border transition-all duration-200
                            min-h-[56px]
                            ${isSelected && i === correctIndex
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : isWrongSelection
                                    ? 'bg-red-50 border-red-300 text-red-600'
                                    : isCorrectAnswer
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        : selected !== null
                                            ? 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] opacity-40'
                                            : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:border-[var(--foreground)] active:bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)]'
                            }
                            ${disabled || selected !== null ? 'cursor-default' : 'cursor-pointer'}
                        `}
                    >
                        {label}
                    </motion.button>
                );
            })}
        </div>
    );
}
