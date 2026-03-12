'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

/**
 * HighlightError Interaction.
 * User sees a sentence with a misused word. They tap the word they think is wrong.
 * We rely on the AI putting the incorrect target word in options[correctIndex] (e.g. the error itself)
 * and the surrounding text in `scenario`. 
 */
export function HighlightErrorInteraction({ question, onAnswer, hasAnswered, result }: InteractionProps) {
    const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);

    // The AI options usually contain the error and the fixes. 
    // We assume options[correctIndex] holds the CORRECT fix,
    // and options[0] or options[1] holds the WRONG original word.
    // For this interaction, we'll try to find the error word in the string.
    
    // Split scenario into tappable words
    const words = useMemo(() => {
        // Simple split by spaces, preserving punctuation attached to words
        return question.scenario.split(' ').filter(Boolean);
    }, [question.scenario]);

    // We need to know which word index is the actual error to grade it.
    // A robust way for a generic frontend: if the user's tapped word string matches 
    // any of the AI options EXCEPT the correctIndex option, they found the error.
    // Alternatively, if the prompt is structured well, the AI scenario has the wrong word,
    // and the correctIndex option is the fix. We check if the tapped word is the wrong word.
    
    // Let's use a simpler heuristic: the user taps a word. We pass the index of the option
    // it most closely matches. But we don't know the exact mapping.
    // For a true HighlightError, the frontend needs to know which word is wrong.
    // Since we only have the standard MCQ shape from AI: 
    // `options` has the corrections, `scenario` has the error sentence.
    // The safest approach here: User taps a word -> it reveals the MCQ options to fix it.
    
    // State 1: Tap to select the error
    // State 2: Select the fix from options
    const [phase, setPhase] = useState<'select_error' | 'select_fix'>('select_error');

    const handleWordTap = (idx: number) => {
        if (hasAnswered) return;
        setSelectedWordIdx(idx);
        // Move to phase 2: fixing it
        setTimeout(() => setPhase('select_fix'), 300);
    };

    const handleFixSelect = (optionIdx: number) => {
        if (hasAnswered) return;
        onAnswer(optionIdx);
    };

    const options = question.options || [];

    return (
        <div className="mt-2 flex flex-col gap-4">
            
            {/* Phase 1: The Sentence with Tappable Words */}
            <div className={cn(
                "p-4 border-2 rounded-lg transition-colors leading-[1.8]",
                phase === 'select_error' ? "border-amber-400/50 bg-amber-400/5" : "border-neutral-800 bg-neutral-900/50",
                hasAnswered && result === 'correct' && "border-emerald-400 bg-emerald-500/10",
                hasAnswered && result === 'wrong' && "border-red-400 bg-red-500/10"
            )}>
                {phase === 'select_error' && !hasAnswered && (
                    <div className="text-[11px] text-amber-400 uppercase tracking-widest mb-3 font-semibold">
                        Tap the incorrect word/phrase:
                    </div>
                )}
                
                <div className="flex flex-wrap gap-1">
                    {words.map((w, i) => (
                        <button
                            key={i}
                            disabled={phase !== 'select_error' || hasAnswered}
                            onClick={() => handleWordTap(i)}
                            className={cn(
                                "px-1 rounded transition-colors text-[15px] font-serif",
                                selectedWordIdx === i ? "bg-amber-400 text-neutral-950 font-medium scale-110 shadow-lg z-10" : 
                                "hover:bg-neutral-800 hover:text-amber-400 text-neutral-300"
                            )}
                        >
                            {w}
                        </button>
                    ))}
                </div>
            </div>

            {/* Phase 2: The Fix Options (standard MCQ) */}
            {phase === 'select_fix' && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1.5"
                >
                    <div className="text-[11px] text-amber-400 uppercase tracking-widest mb-1 font-semibold text-center">
                        Select the correct fix:
                    </div>
                    {options.map((option, i) => {
                        const isCorrect = i === question.correctIndex;
                        const showResult = hasAnswered;
                        const isSelected = hasAnswered && result !== null; // Hacky way to style if we don't store selected index, but we pass it up

                        return (
                            <button
                                key={i}
                                onClick={() => handleFixSelect(i)}
                                disabled={hasAnswered}
                                className={cn(
                                    "w-full text-left text-[13px] leading-snug px-4 py-2 border transition-all duration-200 rounded-sm",
                                    !showResult && "border-neutral-700 text-neutral-300 hover:border-amber-400 hover:text-amber-400 hover:bg-neutral-900",
                                    showResult && isCorrect && "border-emerald-400 bg-emerald-500/15 text-emerald-300",
                                    showResult && !isCorrect && "border-red-400/60 bg-red-500/10 text-red-300 opacity-50",
                                )}
                            >
                                {option}
                            </button>
                        );
                    })}
                </motion.div>
            )}

        </div>
    );
}
