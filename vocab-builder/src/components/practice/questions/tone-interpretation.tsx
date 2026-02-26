'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToneInterpretationContent as ToneContent, ExerciseStoryContext } from '@/lib/db/types';

interface ToneInterpretationContent {
    phrase: string;
    context?: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
}

interface Props {
    question: {
        content: ToneInterpretationContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function ToneInterpretationQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());

    const options = content.options || [];
    const correctIndex = content.correctIndex ?? 0;

    let displayContext = content.context;
    let displayPhrase = content.phrase || (content as any).dialogue || (content as any).text || (content as any).sentence;

    // Robust parsing: If AI merged dialogue into context and left phrase empty or '...'
    if ((!displayPhrase || displayPhrase === '...') && displayContext) {
        const quoteMatch = displayContext.match(/['"](.*?)['"]/);
        if (quoteMatch) {
            displayPhrase = quoteMatch[1];
            displayContext = displayContext.replace(quoteMatch[0], '').replace(/:\s*$/, '').trim();
        } else {
            // Just use context as the main phrase if there are no quotes
            displayPhrase = displayContext;
            displayContext = undefined;
        }
    }

    const handleSelect = (index: number) => {
        if (disabled || selectedIndex !== null) return;

        setSelectedIndex(index);
        const correct = index === correctIndex;
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(options[index] || '', correct, timeTaken);
        }, 800);
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Read the tone
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    How does the speaker feel?
                </p>
            </div>

            {/* Phrase Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 mb-10"
            >
                {displayContext && (
                    <p className="text-xs text-neutral-400 italic mb-3 font-serif">
                        {displayContext}
                    </p>
                )}
                {displayPhrase && displayPhrase !== '...' && (
                    <p className="text-lg font-serif text-neutral-900">
                        &ldquo;{displayPhrase}&rdquo;
                    </p>
                )}
            </motion.div>

            {/* Emotion Options — 2-column grid */}
            <div className="grid grid-cols-2 gap-3 mt-auto" role="radiogroup" aria-label="Answer options">
                {options.map((option: string, i: number) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        onClick={() => handleSelect(i)}
                        disabled={disabled || selectedIndex !== null}
                        className={cn(
                            'w-full p-4 border text-center transition-all duration-200',
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
                        {selectedIndex === i && i === correctIndex && (
                            <div className="mt-2 flex justify-center">
                                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 text-neutral-900" />
                                </div>
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>

            {/* Explanation */}
            {selectedIndex !== null && content.explanation && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 border border-neutral-200 p-4"
                >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-1">Why?</p>
                    <p className="text-sm text-neutral-600">{content.explanation}</p>
                </motion.div>
            )}
        </div>
    );
}
