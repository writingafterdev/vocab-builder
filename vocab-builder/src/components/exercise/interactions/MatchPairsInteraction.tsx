'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface MatchPairsInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function MatchPairsInteraction({ question, onAnswer, disabled }: MatchPairsInteractionProps) {
    const pairs = question.pairs || [];
    const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
    const [matched, setMatched] = useState<Map<number, { rightIdx: number; correct: boolean }>>(new Map());
    const [wrongPair, setWrongPair] = useState<{ left: number; right: number } | null>(null);

    // Shuffle right side (but keep track of original indices)
    const [shuffledRight] = useState(() => {
        const indices = pairs.map((_, i) => i);
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices;
    });

    const allMatched = matched.size === pairs.length;

    const handleLeftTap = useCallback((index: number) => {
        if (disabled || matched.has(index)) return;
        setSelectedLeft(index);
        setWrongPair(null);
    }, [disabled, matched]);

    const handleRightTap = useCallback((originalIndex: number) => {
        if (disabled || selectedLeft === null) return;

        // Check if this right item is already matched
        const alreadyMatched = Array.from(matched.values()).some(v => v.rightIdx === originalIndex);
        if (alreadyMatched) return;

        const correct = selectedLeft === originalIndex; // pairs share the same index

        if (correct) {
            const newMatched = new Map(matched);
            newMatched.set(selectedLeft, { rightIdx: originalIndex, correct: true });
            setMatched(newMatched);
            setSelectedLeft(null);
            setWrongPair(null);

            // Check if all pairs are matched
            if (newMatched.size === pairs.length) {
                setTimeout(() => {
                    onAnswer(0, true);
                }, 800);
            }
        } else {
            setWrongPair({ left: selectedLeft, right: originalIndex });
            setTimeout(() => {
                setWrongPair(null);
                setSelectedLeft(null);
            }, 600);
        }
    }, [disabled, selectedLeft, matched, pairs.length, onAnswer]);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                {/* Left column */}
                <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 block">
                        Match
                    </span>
                    {pairs.map((pair, i) => {
                        const isMatched = matched.has(i);
                        const isSelected = selectedLeft === i;
                        const isWrong = wrongPair?.left === i;

                        return (
                            <motion.button
                                key={`l-${i}`}
                                onClick={() => handleLeftTap(i)}
                                disabled={disabled || isMatched}
                                animate={{
                                    scale: isWrong ? [1, 0.97, 1.02, 1] : 1,
                                    x: isWrong ? [0, -3, 3, 0] : 0,
                                }}
                                transition={{ duration: 0.3 }}
                                className={`
                                    w-full text-left px-3.5 py-3 text-sm
                                    border transition-all duration-200
                                    min-h-[44px]
                                    ${isMatched
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-60'
                                        : isSelected
                                            ? 'bg-neutral-900 border-neutral-900 text-white'
                                            : isWrong
                                                ? 'bg-red-50 border-red-300 text-red-600'
                                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                                    }
                                `}
                            >
                                {pair.left}
                            </motion.button>
                        );
                    })}
                </div>

                {/* Right column */}
                <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 block">
                        With
                    </span>
                    {shuffledRight.map((originalIdx) => {
                        const pair = pairs[originalIdx];
                        const isMatched = Array.from(matched.values()).some(v => v.rightIdx === originalIdx);
                        const isWrong = wrongPair?.right === originalIdx;

                        return (
                            <motion.button
                                key={`r-${originalIdx}`}
                                onClick={() => handleRightTap(originalIdx)}
                                disabled={disabled || isMatched || selectedLeft === null}
                                animate={{
                                    scale: isWrong ? [1, 0.97, 1.02, 1] : 1,
                                    x: isWrong ? [0, -3, 3, 0] : 0,
                                }}
                                transition={{ duration: 0.3 }}
                                className={`
                                    w-full text-left px-3.5 py-3 text-sm
                                    border transition-all duration-200
                                    min-h-[44px]
                                    ${isMatched
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-60'
                                        : isWrong
                                            ? 'bg-red-50 border-red-300 text-red-600'
                                            : selectedLeft !== null
                                                ? 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500 cursor-pointer'
                                                : 'bg-white border-neutral-200 text-neutral-500 cursor-default'
                                    }
                                `}
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                {pair.right}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Matched count */}
            <AnimatePresence>
                {matched.size > 0 && !allMatched && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center text-[11px] text-neutral-400"
                    >
                        {matched.size} / {pairs.length} matched
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}
