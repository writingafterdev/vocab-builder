'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReadingComprehensionContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: ReadingComprehensionContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function ReadingComprehensionQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());
    const [submitted, setSubmitted] = useState(false);

    const passage = content.passage || (content as any).text || '';
    const targetPhrase = content.targetPhrase || '';
    const questionText = content.question || 'What does this phrase mean in context?';
    const options = content.options || [];
    const rawIndex = content.correctIndex ?? 0;
    const correctIndex = Math.max(0, Math.min(rawIndex, (content.options?.length ?? 1) - 1));

    // Highlight the target phrase in the passage
    const renderPassage = () => {
        if (!targetPhrase) return passage;
        const parts = passage.split(new RegExp(`(${targetPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return parts.map((part: string, i: number) =>
            part.toLowerCase() === targetPhrase.toLowerCase()
                ? <span key={i} className="bg-[#1e3a5f]/10 text-[#1e3a5f] font-medium px-0.5">{part}</span>
                : part
        );
    };

    const handleSelect = (index: number) => {
        if (disabled || submitted) return;
        setSelectedIndex(index);
    };

    const handleSubmit = () => {
        if (selectedIndex === null || submitted) return;
        setSubmitted(true);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);
        const correct = selectedIndex === correctIndex;

        setTimeout(() => {
            onAnswer(options[selectedIndex], correct, timeTaken);
        }, 1800);
    };

    const getOptionStyle = (index: number) => {
        if (!submitted) {
            return selectedIndex === index
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-neutral-200 hover:bg-neutral-50';
        }
        if (index === correctIndex) return 'border-[#1e3a5f] bg-[#1e3a5f]/5';
        if (index === selectedIndex && index !== correctIndex) return 'border-red-300 bg-red-50';
        return 'border-neutral-200 opacity-40';
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                        Reading Comprehension
                    </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-serif text-neutral-900 leading-tight">
                    Read & understand
                </h1>
            </div>

            {/* Passage Card */}
            <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 md:p-8 mb-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-4">Passage</p>
                <p className="text-base leading-relaxed text-neutral-700 font-serif">
                    {renderPassage()}
                </p>
            </div>

            {/* Question */}
            <p className="text-sm font-medium text-neutral-900 mb-4 px-1">
                {questionText}
            </p>

            {/* Options */}
            <div className="flex flex-col gap-2 mb-6 flex-1">
                {options.map((option: string, index: number) => (
                    <motion.button
                        key={index}
                        whileHover={{ scale: disabled || submitted ? 1 : 1.01 }}
                        whileTap={{ scale: disabled || submitted ? 1 : 0.99 }}
                        onClick={() => handleSelect(index)}
                        className={cn(
                            "w-full text-left p-4 border-2 transition-all text-sm",
                            getOptionStyle(index)
                        )}
                    >
                        <span className="font-medium text-neutral-500 mr-2">
                            {String.fromCharCode(65 + index)})
                        </span>
                        {option}
                    </motion.button>
                ))}
            </div>

            {/* Submit Button */}
            {!submitted && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleSubmit}
                    disabled={selectedIndex === null || disabled}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2",
                        selectedIndex !== null
                            ? "bg-neutral-900 text-white hover:bg-neutral-800"
                            : "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                    )}
                >
                    Check
                    <ArrowRight className="w-3.5 h-3.5" />
                </motion.button>
            )}
        </div>
    );
}
