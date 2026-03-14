'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

/**
 * Word Builder / Scrambled Interaction.
 * User taps chunks of words to assemble the correct phrase.
 */
export function TapOrderInteraction({ question, onAnswer, hasAnswered, result }: InteractionProps) {
    const correctAnswer = question.options?.[question.correctIndex || 0] || '';
    
    // Split correct answer into chunks and shuffle them ONLY ONCE on mount
    const chunks = useMemo(() => {
        // Simple word split, maybe keep some small words together for less clutter
        const words = correctAnswer.trim().split(/\s+/).filter(Boolean);
        // Shuffle array (Fisher-Yates)
        const shuffled = [...words];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }, [correctAnswer]);

    const [selectedChunks, setSelectedChunks] = useState<number[]>([]);

    const handleTapChunk = (chunkIndex: number) => {
        if (hasAnswered) return;
        
        if (selectedChunks.includes(chunkIndex)) {
            // Deselect
            setSelectedChunks(prev => prev.filter(i => i !== chunkIndex));
        } else {
            // Select
            const newSelected = [...selectedChunks, chunkIndex];
            setSelectedChunks(newSelected);
            
            // Check if all chunks selected
            if (newSelected.length === chunks.length) {
                // Determine if order is correct
                const assembled = newSelected.map(i => chunks[i]).join(' ');
                // Simple string match against correct answer
                const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                const isMatch = clean(assembled) === clean(correctAnswer);
                
                // Slight delay before finalizing to show the last tapped word
                setTimeout(() => {
                    onAnswer(isMatch ? (question.correctIndex || 0) : -1);
                }, 300);
            }
        }
    };

    return (
        <div className="mt-4 flex flex-col gap-4">
            {/* The assembled sentence area (blanks or words) */}
            <div className={cn(
                "min-h-[44px] px-3 py-2 border-b-2 flex flex-wrap gap-1.5 items-center transition-colors",
                !hasAnswered && "border-neutral-200",
                hasAnswered && result === 'correct' && "border-emerald-400",
                hasAnswered && result === 'wrong' && "border-red-400"
            )}>
                {selectedChunks.length === 0 && !hasAnswered && (
                    <span className="text-[13px] text-neutral-600 italic">Tap words to build the text...</span>
                )}
                
                {selectedChunks.map((chunkIdx, i) => (
                    <motion.span
                        key={`assembled-${chunkIdx}`}
                        layoutId={`chunk-${chunkIdx}`}
                        className={cn(
                            "px-2 py-1 bg-neutral-100 rounded text-[13px] font-medium text-neutral-800",
                            hasAnswered && result === 'correct' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                            hasAnswered && result === 'wrong' && "bg-red-50 text-red-700 border border-red-200"
                        )}
                        onClick={() => handleTapChunk(chunkIdx)}
                    >
                        {chunks[chunkIdx]}
                    </motion.span>
                ))}
            </div>

            {/* The available scrambled chunks */}
            <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                    {chunks.map((word, i) => {
                        const isSelected = selectedChunks.includes(i);
                        if (isSelected) return null; // Hide if selected (it's up top)

                        return (
                            <motion.button
                                key={`pool-${i}`}
                                layoutId={`chunk-${i}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                disabled={hasAnswered}
                                onClick={() => handleTapChunk(i)}
                                className="px-3 py-1.5 bg-white border border-neutral-200 rounded text-[13px] text-neutral-600 hover:border-neutral-800 hover:text-neutral-800 transition-colors"
                            >
                                {word}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>
            
            {/* Show correct answer if they got it wrong */}
            {hasAnswered && result === 'wrong' && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[12px] text-emerald-600"
                >
                    Correct: <span className="font-medium">{correctAnswer}</span>
                </motion.p>
            )}
        </div>
    );
}
