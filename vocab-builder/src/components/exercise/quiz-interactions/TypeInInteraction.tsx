'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface InteractionProps {
    question: InlineQuestion;
    onAnswer: (answerIndex: number) => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
}

/**
 * Text Input interaction. No options shown.
 * User must type the correct answer (matches options[correctIndex]).
 */
export function TypeInInteraction({ question, onAnswer, hasAnswered, result }: InteractionProps) {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const correctAnswer = question.options?.[question.correctIndex || 0] || '';

    // Auto-focus input on mount
    useEffect(() => {
        if (!hasAnswered) {
            inputRef.current?.focus();
        }
    }, [hasAnswered]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (hasAnswered || !inputValue.trim()) return;

        // Clean both strings for comparison (lowercase, trim, remove punct)
        const clean = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatch = clean(inputValue) === clean(correctAnswer);
        
        // Pass back the correct index if they got it right, otherwise pass a dummy wrong index (-1)
        onAnswer(isMatch ? (question.correctIndex || 0) : -1);
    };

    return (
        <form onSubmit={handleSubmit} className="mt-4">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={hasAnswered}
                    placeholder="Type the missing word..."
                    className={cn(
                        "w-full bg-white border text-[14px] px-4 py-3 rounded-sm transition-all outline-none",
                        // Default
                        !hasAnswered && "border-neutral-200 text-neutral-800 placeholder-neutral-400 focus:border-blue-400 focus:bg-blue-50/30",
                        // Correct
                        hasAnswered && result === 'correct' && "border-emerald-400 bg-emerald-50 text-emerald-700",
                        // Wrong
                        hasAnswered && result === 'wrong' && "border-red-300 bg-red-50 text-red-700"
                    )}
                />

                {/* Submit Arrow Button */}
                {!hasAnswered && (
                    <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-800 transition-colors disabled:opacity-30 disabled:hover:text-neutral-400"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                )}
            </div>

            {/* Show correct answer if they got it wrong */}
            <AnimatePresence>
                {hasAnswered && result === 'wrong' && (
                    <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[12px] text-emerald-600 mt-2 ml-1"
                    >
                        Correct: <span className="font-medium">{correctAnswer}</span>
                    </motion.p>
                )}
            </AnimatePresence>
        </form>
    );
}
