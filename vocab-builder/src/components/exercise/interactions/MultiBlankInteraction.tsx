'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface MultiBlankInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function MultiBlankInteraction({ question, onAnswer, disabled }: MultiBlankInteractionProps) {
    const clozeText = question.clozeText || '';
    const blanks = question.blanks || [];
    const bank = question.wordBank || [];

    const [fills, setFills] = useState<Map<number, string>>(new Map()); // blankIndex → word
    const [activeBlank, setActiveBlank] = useState<number>(blanks.length > 0 ? blanks[0].index : 1);
    const [isChecked, setIsChecked] = useState(false);
    const [correctMap, setCorrectMap] = useState<Map<number, boolean>>(new Map());

    const allFilled = fills.size === blanks.length;

    const handleWordTap = useCallback((word: string) => {
        if (disabled || isChecked) return;

        // Check if word is already used
        const usedBy = Array.from(fills.entries()).find(([, v]) => v === word);
        if (usedBy) {
            // Remove from its current blank
            const newFills = new Map(fills);
            newFills.delete(usedBy[0]);
            setFills(newFills);
            return;
        }

        // Place in active blank
        const newFills = new Map(fills);
        newFills.set(activeBlank, word);
        setFills(newFills);

        // Auto-advance to next unfilled blank
        const nextBlank = blanks.find(b => !newFills.has(b.index) && b.index !== activeBlank);
        if (nextBlank) {
            setActiveBlank(nextBlank.index);
        }

        // Check if all blanks are filled
        if (newFills.size === blanks.length) {
            // Verify answers
            setTimeout(() => {
                const results = new Map<number, boolean>();
                let allCorrect = true;
                blanks.forEach(blank => {
                    const correct = newFills.get(blank.index) === blank.correctWord;
                    results.set(blank.index, correct);
                    if (!correct) allCorrect = false;
                });
                setCorrectMap(results);
                setIsChecked(true);

                setTimeout(() => {
                    onAnswer(0, allCorrect);
                }, 600);
            }, 300);
        }
    }, [disabled, isChecked, fills, activeBlank, blanks, onAnswer]);

    const handleBlankTap = useCallback((blankIndex: number) => {
        if (disabled || isChecked) return;
        setActiveBlank(blankIndex);
    }, [disabled, isChecked]);

    // Split text around __(N)__ markers
    const parts = clozeText.split(/(_{2,}\(\d+\)_{2,})/);

    return (
        <div className="space-y-6">
            {/* Passage with blanks */}
            <div
                className="text-[16px] leading-[2] text-neutral-800"
                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
            >
                {parts.map((part, i) => {
                    const blankMatch = part.match(/_{2,}\((\d+)\)_{2,}/);
                    if (blankMatch) {
                        const blankIdx = parseInt(blankMatch[1]);
                        const filled = fills.get(blankIdx);
                        const isActive = activeBlank === blankIdx;
                        const isCorrectBlank = correctMap.get(blankIdx);

                        return (
                            <span
                                key={i}
                                onClick={() => handleBlankTap(blankIdx)}
                                className="inline-block mx-1 align-bottom cursor-pointer"
                            >
                                <AnimatePresence mode="wait">
                                    {filled ? (
                                        <motion.span
                                            key={`filled-${blankIdx}`}
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className={`
                                                inline-block px-2 py-0.5 font-medium text-[15px]
                                                ${isChecked
                                                    ? isCorrectBlank
                                                        ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-400'
                                                        : 'bg-red-50 text-red-600 border-b-2 border-red-400 line-through'
                                                    : isActive
                                                        ? 'bg-neutral-100 border-b-2 border-neutral-900'
                                                        : 'bg-neutral-50 border-b-2 border-neutral-300'
                                                }
                                            `}
                                        >
                                            {filled}
                                        </motion.span>
                                    ) : (
                                        <motion.span
                                            key={`blank-${blankIdx}`}
                                            className={`
                                                inline-block w-20 border-b-2 border-dashed text-center text-xs py-0.5
                                                ${isActive
                                                    ? 'border-neutral-900 text-neutral-600'
                                                    : 'border-neutral-300 text-neutral-300'
                                                }
                                            `}
                                        >
                                            ({blankIdx})
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </span>
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
            </div>

            {/* Show correct answers on wrong */}
            {isChecked && Array.from(correctMap.values()).some(v => !v) && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-neutral-500 space-y-0.5"
                >
                    {blanks.map(blank => {
                        if (correctMap.get(blank.index)) return null;
                        return (
                            <p key={blank.index}>
                                <span className="text-neutral-400">({blank.index})</span>{' '}
                                <span className="text-emerald-700 font-medium">{blank.correctWord}</span>
                            </p>
                        );
                    })}
                </motion.div>
            )}

            {/* Word bank */}
            <div className="flex flex-wrap gap-2.5 justify-center pt-1">
                {bank.map((word, i) => {
                    const isUsed = Array.from(fills.values()).includes(word);

                    return (
                        <motion.button
                            key={i}
                            onClick={() => handleWordTap(word)}
                            disabled={disabled || isChecked}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{
                                opacity: isUsed ? 0.3 : 1,
                                y: 0,
                                scale: isUsed ? 0.93 : 1,
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
                                ${isUsed
                                    ? 'bg-neutral-100 border-neutral-200 text-neutral-300 cursor-default'
                                    : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 active:bg-neutral-50 cursor-pointer'
                                }
                            `}
                        >
                            {word}
                        </motion.button>
                    );
                })}
            </div>

            {/* Active blank indicator */}
            {!isChecked && !allFilled && (
                <p className="text-center text-[11px] text-neutral-400">
                    Filling blank ({activeBlank}) · {fills.size} / {blanks.length} filled
                </p>
            )}
        </div>
    );
}
