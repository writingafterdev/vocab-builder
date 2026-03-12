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
 * Match Pairs Interaction.
 * User must connect a phrase to its meaning. 
 * Since this is a single question card, we'll adapt it: 
 * Show 1 Phrase and 3 Meanings to connect (or vice versa), which acts like MCQ but uses a linking/tapping gesture.
 */
export function MatchPairsInteraction({ question, onAnswer, hasAnswered, result }: InteractionProps) {
    const options = question.options || [];
    
    const [selectedPhrase, setSelectedPhrase] = useState(false);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);

    // Shuffle options so correct answer isn't always in the same spot
    const shuffledOptions = useMemo(() => {
        return options.map((opt, i) => ({ text: opt, originalIndex: i }))
            .sort(() => Math.random() - 0.5);
    }, [options]);

    const handleSelectPhrase = () => {
        if (hasAnswered) return;
        setSelectedPhrase(!selectedPhrase);
    };

    const handleSelectOption = (shuffledIndex: number, originalIndex: number) => {
        if (hasAnswered) return;
        
        setSelectedOption(originalIndex);
        
        // If phrase is already selected, simulate a match connection
        if (selectedPhrase) {
            setTimeout(() => {
                onAnswer(originalIndex);
            }, 300);
        } else {
            // Select this option and wait for phrase tap
            setSelectedPhrase(true);
            setTimeout(() => {
                onAnswer(originalIndex);
            }, 300);
        }
    };

    return (
        <div className="mt-2 flex flex-row gap-4 justify-between items-center h-[160px]">
            {/* Left side: The Phrase */}
            <div className="flex-1 flex flex-col justify-center h-full">
                <button
                    disabled={hasAnswered}
                    onClick={handleSelectPhrase}
                    className={cn(
                        "p-4 border-2 rounded-lg text-center transition-all h-24 flex items-center justify-center font-serif text-[15px]",
                        !hasAnswered && !selectedPhrase && "border-neutral-800 bg-neutral-900 text-white hover:border-amber-400",
                        !hasAnswered && selectedPhrase && "border-amber-400 bg-amber-400/10 text-white",
                        hasAnswered && result === 'correct' && "border-emerald-400 bg-emerald-500/15 text-emerald-300",
                        hasAnswered && result === 'wrong' && "border-red-400 bg-red-500/10 text-red-300"
                    )}
                >
                    {question.phrase}
                </button>
            </div>

            {/* Connecting Line Indicator (visual only) */}
            <div className="w-8 flex flex-col items-center justify-center text-neutral-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(
                    "transition-colors",
                    selectedPhrase && selectedOption !== null && !hasAnswered && "text-amber-400",
                    hasAnswered && result === 'correct' && "text-emerald-400",
                    hasAnswered && result === 'wrong' && "text-red-400"
                )}>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <polyline points="15 5 22 12 15 19"></polyline>
                </svg>
            </div>

            {/* Right side: The Options (Meanings) */}
            <div className="flex-[1.5] flex flex-col justify-center gap-2 h-full">
                {shuffledOptions.map((opt, i) => {
                    const isSelected = selectedOption === opt.originalIndex;
                    const isCorrect = opt.originalIndex === question.correctIndex;
                    const showResult = hasAnswered;

                    return (
                        <button
                            key={i}
                            onClick={() => handleSelectOption(i, opt.originalIndex)}
                            disabled={hasAnswered}
                            className={cn(
                                "p-2 border rounded-md text-[11px] text-left transition-all leading-tight min-h-[44px] flex items-center",
                                // Default
                                !showResult && !isSelected && "border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-amber-400 hover:text-neutral-300",
                                // Selected but not answered
                                !showResult && isSelected && "border-amber-400 bg-amber-400/10 text-white",
                                // Correct
                                showResult && isCorrect && "border-emerald-400 bg-emerald-500/15 text-emerald-300",
                                // Wrong (selected)
                                showResult && isSelected && !isCorrect && "border-red-400/60 bg-red-500/10 text-red-300",
                                // Unselected after answer
                                showResult && !isSelected && !isCorrect && "border-neutral-900 text-neutral-700 opacity-50",
                            )}
                        >
                            {opt.text}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
