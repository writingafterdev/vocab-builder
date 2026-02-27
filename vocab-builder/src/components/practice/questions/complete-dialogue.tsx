'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompleteDialogueContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: CompleteDialogueContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function CompleteDialogueQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());

    const options = content.options || (content as any).choices || (content as any).answers || [];
    const rawIndex = content.correctIndex ?? (content as any).correctAnswer ?? 0;
    const correctIndex = Math.max(0, Math.min(rawIndex, (content.options?.length ?? 1) - 1));
    const dialogue = content.dialogue || (content as any).lines || (content as any).conversation || [];

    const handleSelect = (index: number) => {
        if (disabled || selectedIndex !== null) return;

        setSelectedIndex(index);
        const correct = index === correctIndex;
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(options[index] || '', correct, timeTaken);
        }, 500);
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Complete the dialogue
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Select the most appropriate phrase
                </p>
            </div>

            {/* Dialogue Lines */}
            <div className="space-y-6 mb-10">
                {dialogue.map((line: any, i: number) => {
                    const isLearner = line.speaker === 'You' || line.role === 'learner' || line.role === 'Speaker B';

                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={cn(
                                'border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-5',
                                isLearner ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[85%]'
                            )}
                        >
                            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">
                                {line.role || line.speaker}
                            </p>
                            <p className="text-base text-neutral-800 leading-relaxed font-serif">
                                {line.isBlank ? (
                                    <>
                                        {line.text.split('_____').map((part: string, j: number) => (
                                            <span key={j}>
                                                {part}
                                                {j < line.text.split('_____').length - 1 && (
                                                    <span className={cn(
                                                        "inline-block border-b border-dashed border-neutral-300 min-w-[100px] mx-1 transition-colors",
                                                        selectedIndex !== null && "border-neutral-900 text-neutral-900 font-semibold border-solid"
                                                    )}>
                                                        {selectedIndex !== null ? options[selectedIndex] : ''}
                                                    </span>
                                                )}
                                            </span>
                                        ))}
                                    </>
                                ) : (
                                    <>&ldquo;{line.text}&rdquo;</>
                                )}
                            </p>
                        </motion.div>
                    );
                })}
            </div>

            {/* Options — 2-column grid */}
            <div className="grid grid-cols-2 gap-3 mt-auto" role="radiogroup" aria-label="Answer options">
                {options.map((option: string, i: number) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
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
                            'text-sm font-medium',
                            selectedIndex === i && i === correctIndex ? 'text-white' : 'text-neutral-700'
                        )}>
                            {option}
                        </span>

                        {/* Checkmark for selected */}
                        {selectedIndex === i && i === correctIndex && (
                            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 text-neutral-900" />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
