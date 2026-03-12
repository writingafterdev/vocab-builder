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

// Simple heuristic to extract emojis from option strings if the AI included them,
// otherwise provide defaults based on index.
const extractEmoji = (text: string, index: number) => {
    const match = text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u);
    if (match) return match[0];
    
    // Fallbacks if AI didn't provide emojis
    const fallbacks = ['🤔', '😅', '👀', '😤', '😏', '😭'];
    return fallbacks[index % fallbacks.length];
};

const stripEmoji = (text: string) => {
    return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
};

/**
 * Emoji Reaction Interaction.
 * Presents options as large tappable emoji tiles. Good for tone/emotion reading.
 */
export function EmojiReactionInteraction({ question, onAnswer, hasAnswered }: InteractionProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const options = question.options || [];

    const handleSelect = (index: number) => {
        if (hasAnswered) return;
        setSelectedIndex(index);
        onAnswer(index);
    };

    return (
        <div className="mt-4 flex flex-row justify-center gap-3">
            {options.map((option, i) => {
                const isSelected = selectedIndex === i;
                const isCorrect = i === question.correctIndex;
                const showResult = hasAnswered;
                
                const emoji = extractEmoji(option, i);
                const text = stripEmoji(option) || option;

                return (
                    <button
                        key={i}
                        onClick={() => handleSelect(i)}
                        disabled={hasAnswered}
                        className={cn(
                            "flex-1 flex flex-col items-center justify-center p-3 border transition-all duration-200 rounded-lg group max-w-[100px]",
                            // Default
                            !showResult && !isSelected && "border-neutral-800 bg-neutral-900/50 hover:border-amber-400 hover:bg-neutral-900",
                            // Selected but not answered
                            !showResult && isSelected && "border-amber-400 bg-amber-400/10",
                            // Correct
                            showResult && isCorrect && "border-emerald-400 bg-emerald-500/15",
                            // Wrong (selected)
                            showResult && isSelected && !isCorrect && "border-red-400/60 bg-red-500/10",
                            // Unselected after answer
                            showResult && !isSelected && !isCorrect && "border-neutral-900 bg-neutral-950 opacity-40",
                        )}
                    >
                        <span className={cn(
                            "text-3xl mb-1.5 transition-transform duration-200",
                            !hasAnswered && "group-hover:scale-110",
                            isSelected && "scale-110"
                        )}>
                            {emoji}
                        </span>
                        <span className={cn(
                            "text-[10px] leading-tight text-center font-medium line-clamp-2 px-1",
                            showResult && isCorrect ? "text-emerald-300" :
                            showResult && isSelected && !isCorrect ? "text-red-300" :
                            "text-neutral-400"
                        )}>
                            {text}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
