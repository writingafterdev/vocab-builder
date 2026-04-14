'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface ABPickInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

/**
 * Side-by-side A/B comparison — pure answer surface.
 * Tap one to pick. No prompt, no submit button.
 */
export default function ABPickInteraction({ question, onAnswer, disabled }: ABPickInteractionProps) {
    const [selected, setSelected] = useState<number | null>(null);

    const options = question.options || [];
    const correctIndex = question.correctIndex ?? -1;

    const handlePick = useCallback((index: number) => {
        if (disabled || selected !== null) return;
        setSelected(index);
        const isCorrect = index === correctIndex;

        setTimeout(() => {
            onAnswer(index, isCorrect);
        }, 500);
    }, [disabled, selected, correctIndex, onAnswer]);

    return (
        <div className="grid grid-cols-2 gap-3">
            {options.slice(0, 2).map((option, i) => {
                const label = i === 0 ? 'A' : 'B';
                const isSelected = selected === i;
                const isCorrectAnswer = selected !== null && i === correctIndex;
                const isWrongSelection = isSelected && i !== correctIndex;

                return (
                    <motion.button
                        key={i}
                        onClick={() => handlePick(i)}
                        disabled={disabled || selected !== null}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                        className={`
                            text-left p-4
                            border transition-all duration-200
                            min-h-[80px]
                            ${isSelected && i === correctIndex
                                ? 'bg-emerald-50 border-emerald-300'
                                : isWrongSelection
                                    ? 'bg-red-50 border-red-300'
                                    : isCorrectAnswer
                                        ? 'bg-emerald-50 border-emerald-300'
                                        : selected !== null
                                            ? 'bg-[var(--background)] border-[var(--border)] opacity-40'
                                            : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--foreground)] active:bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)]'
                            }
                            ${disabled || selected !== null ? 'cursor-default' : 'cursor-pointer'}
                        `}
                    >
                        <span className={`
                            text-[10px] font-bold uppercase tracking-widest mb-2 block
                            ${isSelected && i === correctIndex ? 'text-emerald-600'
                                : isWrongSelection ? 'text-red-500'
                                : isCorrectAnswer ? 'text-emerald-600'
                                : 'text-[var(--muted-foreground)]'}
                        `}>
                            {label}
                        </span>
                        <p
                            className={`text-[14px] leading-[1.7] ${
                                isWrongSelection ? 'text-red-700'
                                : isCorrectAnswer || (isSelected && i === correctIndex) ? 'text-emerald-800'
                                : 'text-[var(--foreground)]'
                            }`}
                            style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                        >
                            &ldquo;{option}&rdquo;
                        </p>
                    </motion.button>
                );
            })}
        </div>
    );
}
