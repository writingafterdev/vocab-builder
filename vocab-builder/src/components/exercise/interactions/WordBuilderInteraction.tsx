'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface WordBuilderInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function WordBuilderInteraction({ question, onAnswer, disabled }: WordBuilderInteractionProps) {
    const chips = question.sentenceChips || [];
    const correctSentence = question.correctSentence || '';
    const [placed, setPlaced] = useState<number[]>([]); // indices of chips in placed order
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    const handleChipTap = useCallback((chipIndex: number) => {
        if (disabled || isChecked) return;

        if (placed.includes(chipIndex)) {
            // Remove from placed
            setPlaced(prev => prev.filter(i => i !== chipIndex));
        } else {
            // Add to placed
            const newPlaced = [...placed, chipIndex];
            setPlaced(newPlaced);

            // Auto-check when all chips are placed
            if (newPlaced.length === chips.length) {
                const assembled = newPlaced.map(i => chips[i]).join(' ');
                // Normalize: trim, collapse whitespace, case-insensitive compare
                const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/, '');
                const correct = normalize(assembled) === normalize(correctSentence);

                setIsChecked(true);
                setIsCorrect(correct);

                setTimeout(() => {
                    onAnswer(0, correct);
                }, 800);
            }
        }
    }, [disabled, isChecked, placed, chips, correctSentence, onAnswer]);

    const assembledText = placed.map(i => chips[i]).join(' ');

    return (
        <div className="space-y-5">
            {/* Assembled sentence slot */}
            <div
                className={`
                    min-h-[60px] px-4 py-3 border-2 border-dashed transition-colors duration-200
                    ${isChecked
                        ? isCorrect
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-red-300 bg-red-50'
                        : placed.length > 0
                            ? 'border-neutral-400 bg-neutral-50'
                            : 'border-neutral-200 bg-white'
                    }
                `}
            >
                {placed.length === 0 ? (
                    <p className="text-sm text-neutral-300 italic">Tap words to build the sentence...</p>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        <AnimatePresence>
                            {placed.map((chipIndex, i) => (
                                <motion.button
                                    key={`placed-${chipIndex}`}
                                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                                    onClick={() => handleChipTap(chipIndex)}
                                    disabled={disabled || isChecked}
                                    className={`
                                        px-3 py-1.5 text-sm font-medium border
                                        ${isChecked
                                            ? isCorrect
                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                                : 'bg-red-100 border-red-300 text-red-800'
                                            : 'bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-50 cursor-pointer'
                                        }
                                    `}
                                >
                                    {chips[chipIndex]}
                                </motion.button>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Show correct sentence on wrong answer */}
            {isChecked && !isCorrect && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-neutral-500"
                >
                    <span className="font-medium text-neutral-700">Correct:</span>{' '}
                    <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>{correctSentence}</span>
                </motion.div>
            )}

            {/* Available chips */}
            <div className="flex flex-wrap gap-2.5 justify-center pt-1">
                {chips.map((chip, i) => {
                    const isPlaced = placed.includes(i);

                    return (
                        <motion.button
                            key={i}
                            onClick={() => handleChipTap(i)}
                            disabled={disabled || isChecked}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{
                                opacity: isPlaced ? 0.25 : 1,
                                y: 0,
                                scale: isPlaced ? 0.92 : 1,
                            }}
                            transition={{
                                delay: i * 0.04,
                                duration: 0.3,
                                ease: [0.25, 1, 0.5, 1],
                            }}
                            className={`
                                px-4 py-2.5 text-sm font-medium
                                border transition-colors duration-200
                                min-h-[44px]
                                ${isPlaced
                                    ? 'bg-neutral-100 border-neutral-200 text-neutral-300 cursor-default'
                                    : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 active:bg-neutral-50 cursor-pointer'
                                }
                            `}
                        >
                            {chip}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
