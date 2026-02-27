'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompleteTheStoryContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: CompleteTheStoryContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function CompleteTheStoryQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());

    const options = content.options || (content as any).choices || (content as any).answers || [];
    const rawIndex = content.correctIndex ?? (content as any).correctAnswer ?? 0;
    const correctIndex = Math.max(0, Math.min(rawIndex, (content.options?.length ?? 1) - 1));

    const handleSelect = (index: number) => {
        if (disabled || selectedIndex !== null) return;

        setSelectedIndex(index);
        const correct = index === correctIndex;
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(options[index] || '', correct, timeTaken);
        }, 500);
    };

    const storyExcerpt = content.storyExcerpt || (content as any).storySnippet || (content as any).excerpt || (content as any).text || (content as any).sentence || (content as any).paragraph || (content as any).context || 'The story continues here _____';
    const parts: string[] = storyExcerpt.split('_____');

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Complete the passage
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Fill in the narrative
                </p>
            </div>

            {/* Story Excerpt Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 mb-10"
            >
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-3">
                    Passage
                </p>
                <p className="text-base font-serif leading-relaxed text-neutral-800">
                    {parts.map((part, i) => (
                        <span key={i}>
                            {part}
                            {i < parts.length - 1 && (
                                <span className={cn(
                                    "inline-block border-b min-w-[120px] mx-1 px-2 py-0.5 transition-all",
                                    selectedIndex !== null
                                        ? "border-neutral-900 text-neutral-900 font-semibold"
                                        : "border-dashed border-neutral-300"
                                )}>
                                    {selectedIndex !== null ? options[selectedIndex] : '\u00A0'}
                                </span>
                            )}
                        </span>
                    ))}
                </p>
            </motion.div>

            {/* Options — 2-column grid */}
            <div className="grid grid-cols-2 gap-3 mt-auto pb-4" role="radiogroup" aria-label="Answer options">
                {options.map((option: string, i: number) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        onClick={() => handleSelect(i)}
                        disabled={disabled || selectedIndex !== null}
                        className={cn(
                            'w-full p-4 border text-left transition-all duration-200 flex items-center justify-between',
                            selectedIndex === i
                                ? i === correctIndex
                                    ? 'border-neutral-900 bg-neutral-900 text-white'
                                    : 'border-neutral-900 bg-neutral-100'
                                : selectedIndex === null
                                    ? 'border-neutral-200 hover:border-neutral-400 bg-white'
                                    : i === correctIndex
                                        ? 'border-neutral-900 bg-neutral-50'
                                        : 'border-neutral-100 opacity-40'
                        )}
                    >
                        <span className={cn(
                            'text-sm font-medium pr-3',
                            selectedIndex === i && i === correctIndex ? 'text-white' : 'text-neutral-700'
                        )}>
                            {option}
                        </span>

                        {selectedIndex === i && i === correctIndex && (
                            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-neutral-900" />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
