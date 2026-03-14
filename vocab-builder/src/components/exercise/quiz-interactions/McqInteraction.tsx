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
 * Light greyscale theme with accent color feedback.
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
                            !showResult && !isSelected && "border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50",
                            // Selected but not answered
                            !showResult && isSelected && "border-neutral-800 bg-neutral-900 text-white",
                            // Correct
                            showResult && isCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800",
                            // Wrong (selected)
                            showResult && isSelected && !isCorrect && "border-red-300 bg-red-50 text-red-700",
                            // Unselected after answer
                            showResult && !isSelected && !isCorrect && "border-neutral-100 text-neutral-300",
                        )}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
}
