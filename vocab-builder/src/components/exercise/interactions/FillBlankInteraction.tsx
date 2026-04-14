'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface FillBlankInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function FillBlankInteraction({ question, onAnswer, disabled }: FillBlankInteractionProps) {
    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

    const sentence = question.blankSentence || question.prompt || '';
    const bank = question.wordBank || question.options || [];
    const correct = question.correctWord || (question.correctIndex !== undefined ? bank[question.correctIndex] : '');

    const handleTap = useCallback((word: string, index: number) => {
        if (disabled || selectedWord) return;
        const right = word === correct;
        setSelectedWord(word);
        setIsCorrect(right);

        // Brief delay before reporting — let the animation play
        setTimeout(() => {
            onAnswer(index, right);
        }, 600);
    }, [disabled, selectedWord, correct, onAnswer]);

    // Split sentence around ____
    const parts = sentence.split(/(__+)/);

    return (
        <div className="space-y-6">
            {/* Sentence with blank */}
            <div
                className="text-[17px] leading-[1.9] text-neutral-800"
                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
            >
                {parts.map((part, i) => {
                    if (/^_+$/.test(part)) {
                        return (
                            <span key={i} className="inline-block relative mx-1 align-bottom">
                                <AnimatePresence mode="wait">
                                    {selectedWord ? (
                                        <motion.span
                                            key="filled"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                                            className={`inline-block px-2 py-0.5 font-medium ${
                                                isCorrect
                                                    ? 'text-emerald-700 bg-emerald-50'
                                                    : 'text-red-600 bg-red-50'
                                            }`}
                                        >
                                            {selectedWord}
                                        </motion.span>
                                    ) : (
                                        <motion.span
                                            key="blank"
                                            className="inline-block w-24 border-b-2 border-neutral-300 border-dashed"
                                        >
                                            &nbsp;
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </span>
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
            </div>

            {/* Word bank */}
            <div className="flex flex-wrap gap-2.5 justify-center pt-2">
                {bank.map((word, i) => {
                    const isSelected = selectedWord === word;
                    const isWrong = selectedWord && !isSelected && word === correct;

                    return (
                        <motion.button
                            key={word}
                            onClick={() => handleTap(word, i)}
                            disabled={disabled || !!selectedWord}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{
                                opacity: isSelected && !isCorrect ? 0.4 : 1,
                                y: 0,
                                scale: isSelected ? 0.95 : 1,
                            }}
                            transition={{
                                delay: i * 0.05,
                                duration: 0.3,
                                ease: [0.25, 1, 0.5, 1],
                            }}
                            className={`
                                px-4 py-2.5 text-sm font-medium
                                border transition-colors duration-200
                                min-h-[44px] min-w-[44px]
                                ${isSelected && isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : isSelected && !isCorrect
                                        ? 'bg-red-50 border-red-300 text-red-500 line-through'
                                        : isWrong
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 active:bg-neutral-50'
                                }
                                ${disabled || selectedWord ? 'cursor-default' : 'cursor-pointer'}
                            `}
                        >
                            {word}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
