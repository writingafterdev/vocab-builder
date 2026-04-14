'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface HighlightInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

/**
 * Tap-to-highlight sentence selection — pure answer surface.
 * User reads sentences and taps the one that doesn't belong.
 */
export default function HighlightInteraction({ question, onAnswer, disabled }: HighlightInteractionProps) {
    const [selected, setSelected] = useState<number | null>(null);

    const options = question.options || [];
    const correctIndex = question.correctIndex ?? -1;

    const handleTap = useCallback((index: number) => {
        if (disabled || selected !== null) return;
        setSelected(index);
        const isCorrect = index === correctIndex;

        setTimeout(() => {
            onAnswer(index, isCorrect);
        }, 600);
    }, [disabled, selected, correctIndex, onAnswer]);

    return (
        <div className="space-y-1">
            {options.map((sentence, i) => {
                const isSelected = selected === i;
                const isCorrectAnswer = selected !== null && i === correctIndex;
                const isWrongSelection = isSelected && i !== correctIndex;

                return (
                    <motion.button
                        key={i}
                        onClick={() => handleTap(i)}
                        disabled={disabled || selected !== null}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            x: isWrongSelection ? [0, -3, 3, -2, 0] : 0,
                        }}
                        transition={{
                            delay: i * 0.05,
                            duration: 0.3,
                            ease: [0.25, 1, 0.5, 1],
                        }}
                        className={`
                            block w-full text-left px-4 py-3
                            text-[14px] leading-[1.8]
                            border-l-2 transition-all duration-200
                            min-h-[44px]
                            ${isSelected && i === correctIndex
                                ? 'border-l-emerald-400 bg-emerald-50/60 text-emerald-800'
                                : isWrongSelection
                                    ? 'border-l-red-400 bg-red-50/60 text-red-700'
                                    : isCorrectAnswer
                                        ? 'border-l-emerald-400 bg-emerald-50/60 text-emerald-800'
                                        : selected !== null
                                            ? 'border-l-transparent text-[var(--muted-foreground)] opacity-40'
                                            : 'border-l-transparent text-[var(--foreground)] hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)] hover:border-l-[var(--foreground)] active:bg-[color-mix(in_oklch,var(--background),var(--foreground)_6%)]'
                            }
                            ${disabled || selected !== null ? 'cursor-default' : 'cursor-pointer'}
                        `}
                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                    >
                        {sentence}
                    </motion.button>
                );
            })}
        </div>
    );
}
