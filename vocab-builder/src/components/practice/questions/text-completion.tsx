'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextCompletionContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: TextCompletionContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function TextCompletionQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [startTime] = useState(Date.now());
    const [submitted, setSubmitted] = useState(false);
    const [activeBlank, setActiveBlank] = useState<string | null>(null);
    const [filledBlanks, setFilledBlanks] = useState<Record<string, string>>({});

    const paragraph = content.paragraph || '';
    const blanks = content.blanks || [];
    const wordBank = content.wordBank || [];

    // Auto-select first blank on mount
    useEffect(() => {
        if (blanks.length > 0 && !activeBlank) {
            setActiveBlank(blanks[0].id);
        }
    }, [blanks]);

    // Track which words from the bank have been used
    const usedWords = useMemo(() => new Set(Object.values(filledBlanks)), [filledBlanks]);

    // Parse paragraph into segments: text and blanks
    const segments = useMemo(() => {
        const result: Array<{ type: 'text' | 'blank'; content: string; blankId?: string }> = [];
        const regex = /\[BLANK_\d+\]/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(paragraph)) !== null) {
            if (match.index > lastIndex) {
                result.push({ type: 'text', content: paragraph.slice(lastIndex, match.index) });
            }
            const blankId = match[0].replace(/[\[\]]/g, '');
            result.push({ type: 'blank', content: match[0], blankId });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < paragraph.length) {
            result.push({ type: 'text', content: paragraph.slice(lastIndex) });
        }
        return result;
    }, [paragraph]);

    const allBlanksFilled = blanks.length > 0 && blanks.every(b => filledBlanks[b.id]);

    const handleWordSelect = (word: string) => {
        if (disabled || submitted || !activeBlank) return;

        // If this word is already used in another blank, remove it from there
        const existingBlank = Object.entries(filledBlanks).find(([, v]) => v === word);
        if (existingBlank) {
            setFilledBlanks(prev => {
                const next = { ...prev };
                delete next[existingBlank[0]];
                return next;
            });
        }

        setFilledBlanks(prev => {
            const updated = { ...prev, [activeBlank]: word };
            // Auto-advance to next empty blank using fresh state
            const nextEmpty = blanks.find(b => b.id !== activeBlank && !updated[b.id]);
            setActiveBlank(nextEmpty?.id || null);
            return updated;
        });
    };

    const handleBlankClick = (blankId: string) => {
        if (disabled || submitted) return;
        if (activeBlank === blankId && filledBlanks[blankId]) {
            // Click on filled blank = remove word
            setFilledBlanks(prev => {
                const next = { ...prev };
                delete next[blankId];
                return next;
            });
        }
        setActiveBlank(blankId);
    };

    const handleSubmit = () => {
        if (!allBlanksFilled || submitted) return;
        setSubmitted(true);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        const allCorrect = blanks.every(b => filledBlanks[b.id] === b.correctAnswer);

        setTimeout(() => {
            onAnswer(
                blanks.map(b => `${b.id}=${filledBlanks[b.id]}`).join(', '),
                allCorrect,
                timeTaken
            );
        }, 1800);
    };

    const getBlankStyle = (blankId: string) => {
        const filled = filledBlanks[blankId];
        const isActive = activeBlank === blankId;
        const blankDef = blanks.find(b => b.id === blankId);

        if (submitted && filled) {
            const isCorrect = filled === blankDef?.correctAnswer;
            return isCorrect
                ? 'bg-[#1e3a5f]/10 border-[#1e3a5f] text-[#1e3a5f]'
                : 'bg-red-50 border-red-300 text-red-600 line-through';
        }

        if (filled) {
            return isActive
                ? 'bg-neutral-100 border-neutral-900 text-neutral-900'
                : 'bg-neutral-50 border-neutral-400 text-neutral-700';
        }

        return isActive
            ? 'border-neutral-900 border-dashed bg-amber-50/50 animate-pulse'
            : 'border-neutral-300 border-dashed';
    };

    const getWordBankStyle = (word: string) => {
        if (submitted) {
            const isAnswer = blanks.some(b => b.correctAnswer === word);
            const wasUsed = usedWords.has(word);
            if (isAnswer && wasUsed) return 'bg-[#1e3a5f]/10 border-[#1e3a5f] text-[#1e3a5f]';
            if (wasUsed) return 'bg-red-50 border-red-200 text-red-400';
            return 'border-neutral-200 opacity-30';
        }

        if (usedWords.has(word)) return 'bg-neutral-100 border-neutral-300 text-neutral-400';
        return 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50';
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 mb-3">
                    <LayoutGrid className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                        Text Completion
                    </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-serif text-neutral-900 leading-tight">
                    Complete the passage
                </h1>
                <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 mt-2">
                    Tap a blank, then select a word from the bank
                </p>
            </div>

            {/* Passage with blanks */}
            <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 md:p-8 mb-6 flex-1">
                <p className="text-base leading-[2] text-neutral-700 font-serif">
                    {segments.map((seg, i) => {
                        if (seg.type === 'text') return <span key={i}>{seg.content}</span>;

                        const blankId = seg.blankId!;
                        const filled = filledBlanks[blankId];
                        return (
                            <motion.span
                                key={i}
                                whileHover={{ scale: disabled || submitted ? 1 : 1.02 }}
                                whileTap={{ scale: disabled || submitted ? 1 : 0.98 }}
                                onClick={() => handleBlankClick(blankId)}
                                className={cn(
                                    "inline-flex items-center justify-center min-w-[120px] px-3 py-0.5 mx-1 border-2 cursor-pointer transition-all text-sm font-medium align-baseline",
                                    getBlankStyle(blankId)
                                )}
                            >
                                {filled || (
                                    <span className="text-neutral-400 text-xs">
                                        {blankId.replace('_', ' ')}
                                    </span>
                                )}
                            </motion.span>
                        );
                    })}
                </p>

                {/* Show correct answers after submission */}
                {submitted && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 border-t border-neutral-100 pt-4"
                    >
                        {blanks.map(b => {
                            const userAnswer = filledBlanks[b.id];
                            const isCorrect = userAnswer === b.correctAnswer;
                            return (
                                <p key={b.id} className="text-xs text-neutral-500 mb-1">
                                    <span className="font-medium">{b.id.replace('_', ' ')}:</span>{' '}
                                    {isCorrect
                                        ? <span className="text-[#1e3a5f]">{b.correctAnswer} ✓</span>
                                        : <><span className="text-red-500 line-through">{userAnswer}</span> → <span className="text-[#1e3a5f]">{b.correctAnswer}</span></>
                                    }
                                </p>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* Word Bank */}
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-3">
                Word Bank
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
                {wordBank.map((word: string, i: number) => (
                    <motion.button
                        key={i}
                        whileHover={{ scale: disabled || submitted ? 1 : 1.03 }}
                        whileTap={{ scale: disabled || submitted ? 1 : 0.97 }}
                        onClick={() => handleWordSelect(word)}
                        disabled={disabled || submitted}
                        className={cn(
                            "px-3 py-1.5 border text-sm transition-all cursor-pointer",
                            !activeBlank && !submitted && 'opacity-50',
                            getWordBankStyle(word)
                        )}
                    >
                        {word}
                    </motion.button>
                ))}
            </div>

            {/* Submit Button */}
            {!submitted && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleSubmit}
                    disabled={!allBlanksFilled || disabled}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2",
                        allBlanksFilled
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
