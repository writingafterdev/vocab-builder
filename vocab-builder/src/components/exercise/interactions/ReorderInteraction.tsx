'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface ReorderInteractionProps {
    question: SessionQuestion;
    onAnswer: (orderedItems: string[], correct: boolean) => void;
    disabled?: boolean;
}

/**
 * Reorder interaction — tap arrows to move items up/down.
 * Has a "Check Order" button since the answer involves arrangement.
 */
export default function ReorderInteraction({ question, onAnswer, disabled }: ReorderInteractionProps) {
    const items = question.items || question.options || [];
    const correctOrder = question.correctOrder || [];

    const [order, setOrder] = useState<number[]>(() =>
        [...Array(items.length).keys()].sort(() => Math.random() - 0.5)
    );
    const [answered, setAnswered] = useState(false);

    const handleTapMove = useCallback((currentIdx: number, direction: 'up' | 'down') => {
        if (answered || disabled) return;
        const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
        if (targetIdx < 0 || targetIdx >= order.length) return;

        setOrder(prev => {
            const next = [...prev];
            [next[currentIdx], next[targetIdx]] = [next[targetIdx], next[currentIdx]];
            return next;
        });
    }, [answered, disabled, order.length]);

    const handleSubmit = useCallback(() => {
        if (answered || disabled) return;
        const isCorrect = correctOrder.length > 0
            ? order.every((itemIdx, position) => itemIdx === correctOrder[position])
            : false;
        setAnswered(true);
        onAnswer(order.map(i => items[i]), isCorrect);
    }, [answered, disabled, correctOrder, order, items, onAnswer]);

    return (
        <div className="space-y-3">
            {/* Items */}
            <div className="space-y-1.5">
                {order.map((itemIdx, position) => {
                    const isCorrectPosition = answered && correctOrder.length > 0 && correctOrder[position] === itemIdx;
                    const isWrongPosition = answered && correctOrder.length > 0 && correctOrder[position] !== itemIdx;

                    return (
                        <motion.div
                            key={itemIdx}
                            layout
                            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                            className={`
                                flex items-center gap-3
                                px-4 py-3
                                border transition-colors duration-200
                                ${isCorrectPosition
                                    ? 'bg-emerald-50 border-emerald-300'
                                    : isWrongPosition
                                        ? 'bg-red-50 border-red-300'
                                        : 'bg-[var(--background)] border-[var(--border)]'
                                }
                            `}
                        >
                            {/* Position number */}
                            <span className={`
                                text-[12px] font-bold tabular-nums w-5 shrink-0
                                ${isCorrectPosition ? 'text-emerald-600'
                                    : isWrongPosition ? 'text-red-500'
                                    : 'text-[var(--muted-foreground)]'}
                            `}>
                                {position + 1}
                            </span>

                            {/* Text */}
                            <span
                                className={`flex-1 text-[14px] leading-[1.7] ${
                                    isCorrectPosition ? 'text-emerald-800'
                                    : isWrongPosition ? 'text-red-700'
                                    : 'text-[var(--foreground)]'
                                }`}
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                {items[itemIdx]}
                            </span>

                            {/* Move arrows */}
                            {!answered && !disabled && (
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button
                                        onClick={() => handleTapMove(position, 'up')}
                                        disabled={position === 0}
                                        className="w-7 h-7 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-20 transition-colors"
                                        aria-label="Move up"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        onClick={() => handleTapMove(position, 'down')}
                                        disabled={position === order.length - 1}
                                        className="w-7 h-7 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-20 transition-colors"
                                        aria-label="Move down"
                                    >
                                        ↓
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Submit button */}
            {!answered && !disabled && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    onClick={handleSubmit}
                    className="w-full py-3.5 bg-[var(--foreground)] text-[var(--background)] text-[11px] font-bold uppercase tracking-[0.15em] hover:opacity-90 transition-opacity"
                >
                    Check Order
                </motion.button>
            )}
        </div>
    );
}
