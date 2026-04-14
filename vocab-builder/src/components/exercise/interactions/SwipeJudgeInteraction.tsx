'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence, PanInfo } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface SwipeJudgeInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function SwipeJudgeInteraction({ question, onAnswer, disabled }: SwipeJudgeInteractionProps) {
    const cards = question.swipeCards || [];
    const [currentCard, setCurrentCard] = useState(0);
    const [results, setResults] = useState<boolean[]>([]);
    const [lastResult, setLastResult] = useState<{ correct: boolean; direction: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const card = cards[currentCard];
    const isDone = currentCard >= cards.length;

    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-12, 12]);
    const leftOpacity = useTransform(x, [-120, -40], [1, 0]);
    const rightOpacity = useTransform(x, [40, 120], [0, 1]);

    const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
        if (disabled || !card) return;
        const threshold = 80;
        const swipedRight = info.offset.x > threshold;
        const swipedLeft = info.offset.x < -threshold;

        if (!swipedRight && !swipedLeft) return; // snap back

        const userSaysNatural = swipedRight;
        const correct = userSaysNatural === card.isNatural;

        setLastResult({ correct, direction: swipedRight ? 'right' : 'left' });
        setResults(prev => [...prev, correct]);

        setTimeout(() => {
            setLastResult(null);
            const nextIdx = currentCard + 1;
            setCurrentCard(nextIdx);

            if (nextIdx >= cards.length) {
                // All cards done — report overall result
                const allResults = [...results, correct];
                const totalCorrect = allResults.filter(Boolean).length;
                const overallCorrect = totalCorrect >= allResults.length / 2;
                onAnswer(0, overallCorrect);
            }
        }, 500);
    }, [disabled, card, currentCard, cards.length, results, onAnswer]);

    if (isDone || cards.length === 0) {
        return (
            <div className="text-center py-8 text-neutral-400 text-sm">
                All done
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Card stack area */}
            <div ref={containerRef} className="relative h-[180px] flex items-center justify-center">
                {/* Hint labels */}
                <motion.div
                    style={{ opacity: leftOpacity }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-red-400"
                >
                    ✗ Unnatural
                </motion.div>
                <motion.div
                    style={{ opacity: rightOpacity }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-emerald-400"
                >
                    Natural ✓
                </motion.div>

                <AnimatePresence mode="popLayout">
                    {card && (
                        <motion.div
                            key={currentCard}
                            style={{ x, rotate }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.7}
                            onDragEnd={handleDragEnd}
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, x: lastResult?.direction === 'right' ? 300 : -300, transition: { duration: 0.3 } }}
                            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                            className="
                                absolute w-[85%] max-w-sm
                                px-6 py-8
                                bg-white border border-neutral-200
                                shadow-sm cursor-grab active:cursor-grabbing
                                select-none touch-pan-y
                            "
                        >
                            <p
                                className="text-[16px] leading-[1.85] text-neutral-800 text-center"
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                &ldquo;{card.text}&rdquo;
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 pt-2">
                {cards.map((_, i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                            i < currentCard
                                ? results[i] ? 'bg-emerald-400' : 'bg-red-400'
                                : i === currentCard ? 'bg-neutral-900' : 'bg-neutral-200'
                        }`}
                    />
                ))}
            </div>

            {/* Instruction */}
            <p className="text-center text-[11px] text-neutral-400 uppercase tracking-wider">
                Swipe right if natural · left if not
            </p>
        </div>
    );
}
