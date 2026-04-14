'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface TapPassageInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function TapPassageInteraction({ question, onAnswer, disabled }: TapPassageInteractionProps) {
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

    const segments = useMemo(() => {
        // Use tappableSegments if provided, otherwise split passageReference by sentence
        if (question.tappableSegments && question.tappableSegments.length > 0) {
            return question.tappableSegments;
        }
        // Fallback: split passage by sentence
        const text = question.passageReference || '';
        return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    }, [question.tappableSegments, question.passageReference]);

    const correctIdx = question.correctSegmentIndex ?? -1;

    const handleTap = useCallback((index: number) => {
        if (disabled || selectedIdx !== null) return;

        const correct = index === correctIdx;
        setSelectedIdx(index);
        setIsCorrect(correct);

        setTimeout(() => {
            onAnswer(index, correct);
        }, 800);
    }, [disabled, selectedIdx, correctIdx, onAnswer]);

    return (
        <div className="space-y-1">
            {segments.map((segment, i) => {
                const isSelected = selectedIdx === i;
                const isCorrectAnswer = selectedIdx !== null && i === correctIdx;
                const isWrongSelection = isSelected && !isCorrect;

                return (
                    <motion.button
                        key={i}
                        onClick={() => handleTap(i)}
                        disabled={disabled || selectedIdx !== null}
                        animate={
                            isWrongSelection
                                ? { x: [0, -4, 4, -2, 2, 0] }
                                : isCorrectAnswer
                                    ? { backgroundColor: ['rgba(16, 185, 129, 0)', 'rgba(16, 185, 129, 0.08)'] }
                                    : {}
                        }
                        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                        className={`
                            block w-full text-left px-4 py-3
                            text-[15px] leading-[1.85]
                            transition-all duration-200
                            border-l-2
                            min-h-[44px]
                            ${isSelected && isCorrect
                                ? 'border-l-emerald-400 bg-emerald-50/50 text-emerald-800'
                                : isWrongSelection
                                    ? 'border-l-red-400 bg-red-50/50 text-red-700'
                                    : isCorrectAnswer && selectedIdx !== null
                                        ? 'border-l-emerald-400 bg-emerald-50/50 text-emerald-800'
                                        : selectedIdx !== null
                                            ? 'border-l-transparent text-neutral-400'
                                            : 'border-l-transparent text-neutral-800 hover:bg-neutral-50 hover:border-l-neutral-300 active:bg-neutral-100'
                            }
                            ${disabled || selectedIdx !== null ? 'cursor-default' : 'cursor-pointer'}
                        `}
                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                    >
                        {segment}
                    </motion.button>
                );
            })}
        </div>
    );
}
