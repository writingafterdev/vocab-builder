'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExerciseStoryContext } from '@/lib/db/types';

interface ContrastExposureContent {
    phraseA: string;
    phraseB: string;
    meaningA?: string;
    meaningB?: string;
    options: string[];
    correctIndex: number;
}

interface Props {
    question: {
        content: ContrastExposureContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function ContrastExposureQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());

    const options = content.options || (content as any).choices || (content as any).answers || [
        'Option A describes the difference accurately',
        'Option B misinterprets one phrase',
        'Option C misinterprets both phrases',
        'Option D says there is no difference'
    ];
    const rawIndex = content.correctIndex ?? (content as any).correctAnswer ?? (content as any).answer ?? 0;
    const correctIndex = Math.max(0, Math.min(rawIndex, (options.length) - 1));

    const phraseA = content.phraseA || (content as any).phrase1 || (content as any).phrase || 'Phrase A';
    const phraseB = content.phraseB || (content as any).phrase2 || (content as any).comparison || 'Phrase B';

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
                    What&rsquo;s the difference?
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Compare the two expressions
                </p>
            </div>

            {/* Two Phrases Side by Side */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 gap-4 mb-10"
            >
                <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">A</p>
                    <p className="text-base font-serif text-neutral-900">&ldquo;{phraseA}&rdquo;</p>
                    {content.meaningA && (
                        <p className="text-xs text-neutral-400 mt-2 italic">{content.meaningA}</p>
                    )}
                </div>
                <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">B</p>
                    <p className="text-base font-serif text-neutral-900">&ldquo;{phraseB}&rdquo;</p>
                    {content.meaningB && (
                        <p className="text-xs text-neutral-400 mt-2 italic">{content.meaningB}</p>
                    )}
                </div>
            </motion.div>

            {/* Options — 2-column grid */}
            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 mb-3 text-center">
                The key difference is...
            </p>
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
