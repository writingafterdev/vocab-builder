'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

/**
 * Standard Multiple Choice Question interaction.
 * Displays 3 buttons, user taps one.
 */
export function McqInteraction({ question, onAnswer, hasAnswered }: InteractionProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const options = question.options || [];

    const handleSelect = (index: number) => {
        if (hasAnswered) return;
        setSelectedIndex(index);
        onAnswer(index);
    };

    return (
        <div className="mt-3 flex flex-col gap-1.5">
            {options.map((option, i) => {
                const isSelected = selectedIndex === i;
                const isCorrect = i === question.correctIndex;
                const showResult = hasAnswered;

                return (
                    <button
                        key={i}
                        onClick={() => handleSelect(i)}
                        disabled={hasAnswered}
                        className={cn(
                            "w-full text-left text-[13px] leading-snug px-4 py-2.5 border transition-all duration-200 rounded-sm",
                            // Default
                            !showResult && !isSelected && "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-white/5",
                            // Selected but not answered
                            !showResult && isSelected && "border-amber-400 bg-amber-400/10 text-white",
                            // Correct
                            showResult && isCorrect && "border-emerald-400 bg-emerald-500/15 text-emerald-300",
                            // Wrong (selected)
                            showResult && isSelected && !isCorrect && "border-red-400/60 bg-red-500/10 text-red-300",
                            // Unselected after answer
                            showResult && !isSelected && !isCorrect && "border-neutral-800 text-neutral-600",
                        )}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
}
