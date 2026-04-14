'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface FreeWriteInteractionProps {
    question: SessionQuestion;
    onAnswer: (text: string) => void;
    disabled?: boolean;
    isEvaluating?: boolean;
    feedback?: { correct: boolean; feedback: string; suggestion?: string } | null;
}

/**
 * Free-form text input — pure answer surface.
 * Collects text, session page handles AI evaluation externally.
 */
export default function FreeWriteInteraction({
    question,
    onAnswer,
    disabled,
    isEvaluating,
    feedback,
}: FreeWriteInteractionProps) {
    const [text, setText] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const minLength = question.type === 'synthesis_response' ? 80 : 30;
    const placeholder = question.type === 'synthesis_response'
        ? 'Write 3–5 sentences taking your own position...'
        : question.type === 'register_shift'
            ? 'Rewrite for the new audience...'
            : 'Rewrite to fix the issue...';

    const handleSubmit = useCallback(() => {
        if (text.trim().length < minLength || submitted) return;
        setSubmitted(true);
        onAnswer(text.trim());
    }, [text, minLength, submitted, onAnswer]);

    const charProgress = Math.min(text.length / minLength, 1);

    return (
        <div className="space-y-3">
            {/* Evaluation criteria — subtle, not a list */}
            {question.evaluationCriteria && question.evaluationCriteria.length > 0 && !submitted && (
                <p className="text-[11px] text-[var(--muted-foreground)] italic">
                    We'll check for: {question.evaluationCriteria.join(' · ')}
                </p>
            )}

            {/* Text area */}
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                rows={4}
                disabled={submitted || disabled}
                className="
                    w-full px-4 py-3
                    text-[15px] leading-[1.8]
                    bg-[var(--background)] text-[var(--foreground)]
                    border border-[var(--border)]
                    placeholder:text-[var(--muted-foreground)] placeholder:opacity-50
                    focus:outline-none focus:border-[var(--foreground)]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    resize-none transition-colors duration-200
                "
                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
            />

            {/* Footer: char count + submit */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* Mini progress bar */}
                    <div className="w-16 h-0.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <motion.div
                            className={`h-full rounded-full ${charProgress >= 1 ? 'bg-emerald-400' : 'bg-[var(--foreground)]'}`}
                            animate={{ width: `${charProgress * 100}%` }}
                            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                        />
                    </div>
                    <span className={`text-[11px] tabular-nums ${
                        charProgress >= 1 ? 'text-emerald-600' : 'text-[var(--muted-foreground)]'
                    }`}>
                        {text.length}/{minLength}
                    </span>
                </div>

                {!submitted && (
                    <button
                        onClick={handleSubmit}
                        disabled={text.trim().length < minLength || disabled}
                        className="
                            px-6 py-2.5
                            bg-[var(--foreground)] text-[var(--background)]
                            text-[11px] font-bold uppercase tracking-[0.15em]
                            hover:opacity-90 transition-opacity
                            disabled:opacity-30 disabled:cursor-not-allowed
                        "
                    >
                        Submit
                    </button>
                )}
            </div>

            {/* Evaluating state */}
            {isEvaluating && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 py-2 text-[13px] text-[var(--muted-foreground)]"
                >
                    <span className="w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--foreground)] rounded-full animate-spin" />
                    Evaluating your response...
                </motion.div>
            )}

            {/* Feedback */}
            {feedback && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                    className={`px-4 py-3 text-sm ${
                        feedback.correct
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                    }`}
                >
                    <p className="font-medium mb-1">
                        {feedback.correct ? '✓ Well done' : '△ Room for improvement'}
                    </p>
                    <p className="text-[13px] opacity-80 leading-relaxed">{feedback.feedback}</p>
                    {feedback.suggestion && (
                        <p className="text-[13px] opacity-70 mt-2 italic">
                            Consider: {feedback.suggestion}
                        </p>
                    )}
                </motion.div>
            )}
        </div>
    );
}
