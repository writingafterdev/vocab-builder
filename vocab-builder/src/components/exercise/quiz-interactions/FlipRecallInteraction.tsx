'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number, bonus?: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

/**
 * Flashcard style Flip & Recall.
 * Shows phrase -> user taps to reveal meaning -> user self-rates memory.
 */
export function FlipRecallInteraction({ question, onAnswer, hasAnswered }: InteractionProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    
    // We assume options[correctIndex] holds the strict correct meaning, 
    // or we just use the first option if it's not set.
    const meaning = question.options?.[question.correctIndex || 0] || question.explanation || '';

    const handleRate = (rating: 'perfect' | 'fuzzy' | 'clueless') => {
        if (hasAnswered) return;
        
        let xp = 0;
        let isCorrectMatch = false;
        
        if (rating === 'perfect') {
            xp = 5; // Bonus for strong recall
            isCorrectMatch = true;
        } else if (rating === 'fuzzy') {
            xp = 0; // Got it, but weak
            isCorrectMatch = true;
        } else {
            isCorrectMatch = false; // Failed recall
        }
        
        // Pass the correct index if they recalled it (perfect/fuzzy), otherwise wrong index (-1)
        onAnswer(isCorrectMatch ? (question.correctIndex || 0) : -1, xp);
    };

    return (
        <div className="mt-2 flex flex-col items-center justify-center h-[160px] relative perspective-1000">
            <AnimatePresence mode="wait">
                {!isFlipped ? (
                    <motion.button
                        key="front"
                        initial={{ rotateX: -90, opacity: 0 }}
                        animate={{ rotateX: 0, opacity: 1 }}
                        exit={{ rotateX: 90, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => setIsFlipped(true)}
                        className="w-full h-full border border-neutral-200 bg-white rounded-md flex flex-col items-center justify-center gap-3 hover:border-neutral-400 hover:bg-neutral-50 transition-all group"
                    >
                        <span className="text-xl font-medium text-neutral-800 px-6 text-center" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                            {question.phrase}
                        </span>
                        <span className="text-[11px] text-neutral-400 uppercase tracking-widest group-hover:text-neutral-600 transition-colors">
                            Tap to reveal meaning
                        </span>
                    </motion.button>
                ) : (
                    <motion.div
                        key="back"
                        initial={{ rotateX: -90, opacity: 0 }}
                        animate={{ rotateX: 0, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full border border-neutral-200 bg-neutral-50 rounded-md flex flex-col"
                    >
                        {/* Meaning Area */}
                        <div className="flex-1 flex items-center justify-center px-6 text-center border-b border-neutral-200">
                            <p className="text-[14px] text-neutral-600 leading-relaxed">
                                {meaning}
                            </p>
                        </div>
                        
                        {/* Self-Rating Buttons */}
                        <div className="h-[48px] flex divide-x divide-neutral-200">
                            <button
                                disabled={hasAnswered}
                                onClick={() => handleRate('clueless')}
                                className={cn(
                                    "flex-1 text-[12px] font-medium transition-colors duration-200",
                                    !hasAnswered ? "text-neutral-400 hover:text-red-500 hover:bg-red-50" : "text-neutral-300 opacity-50"
                                )}
                            >
                                No Clue
                            </button>
                            <button
                                disabled={hasAnswered}
                                onClick={() => handleRate('fuzzy')}
                                className={cn(
                                    "flex-1 text-[12px] font-medium transition-colors duration-200",
                                    !hasAnswered ? "text-neutral-400 hover:text-amber-500 hover:bg-amber-50" : "text-neutral-300 opacity-50"
                                )}
                            >
                                Fuzzy
                            </button>
                            <button
                                disabled={hasAnswered}
                                onClick={() => handleRate('perfect')}
                                className={cn(
                                    "flex-1 text-[12px] font-medium transition-colors duration-200",
                                    !hasAnswered ? "text-neutral-400 hover:text-emerald-500 hover:bg-emerald-50" : "text-neutral-300 opacity-50"
                                )}
                            >
                                Knew It
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
