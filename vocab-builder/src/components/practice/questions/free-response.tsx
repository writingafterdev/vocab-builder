'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { FreeResponseContent, ExerciseStoryContext, AIEvaluationResult } from '@/lib/db/types';
import { useAuth } from '@/lib/auth-context';

interface Props {
    question: {
        content: FreeResponseContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function FreeResponseQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [input, setInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<AIEvaluationResult | null>(null);
    const [startTime] = useState(Date.now());
    const { user } = useAuth();

    const handleSubmit = async () => {
        if (disabled || isSubmitting || !input.trim()) return;

        setIsSubmitting(true);

        try {
            const token = await user?.getIdToken();

            const response = await fetch('/api/user/evaluate-response', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...(user?.uid && { 'x-user-id': user.uid }),
                },
                body: JSON.stringify({
                    questionType: 'free_response',
                    userResponse: input,
                    targetPhrase: content.targetPhrase,
                    context: content.context,
                }),
            });

            const data = await response.json();
            setResult(data);

            const timeTaken = Math.round((Date.now() - startTime) / 1000);

            setTimeout(() => {
                onAnswer(input, data.correct, timeTaken);
            }, 1500);

        } catch (error) {
            console.error('Evaluation error:', error);
            setResult({
                correct: true,
                naturalness: 'natural',
                feedback: 'Good effort!',
            });
            const timeTaken = Math.round((Date.now() - startTime) / 1000);
            setTimeout(() => onAnswer(input, true, timeTaken), 1500);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Open response
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Write your answer naturally
                </p>
            </div>

            {/* Context Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 mb-8"
            >
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">
                    Scenario
                </p>
                <p className="text-base text-neutral-800 leading-relaxed font-serif">
                    {content.context || (content as any).scenario || content.prompt}
                </p>
                {(content as any).dialogueBefore && (
                    <div className="mt-4 pt-4 border-t border-neutral-100">
                        <p className="text-sm text-neutral-700 whitespace-pre-wrap font-medium">
                            {(content as any).dialogueBefore}
                        </p>
                    </div>
                )}
            </motion.div>

            {/* Text Input */}
            <div className="mb-6">
                <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium mb-3">
                    Your Response
                </p>
                <div className={cn(
                    'border transition-all overflow-hidden',
                    result
                        ? result.correct
                            ? 'border-neutral-900 bg-neutral-50'
                            : 'border-neutral-300 bg-neutral-50'
                        : 'border-neutral-200 bg-white focus-within:border-neutral-900'
                )}>
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your response..."
                        disabled={disabled || result !== null}
                        className="h-32 bg-transparent border-none text-neutral-800 text-base placeholder:text-neutral-300 focus-visible:ring-0 resize-none p-4"
                    />
                </div>
            </div>

            {/* Inline Feedback */}
            {result && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 mb-6 border border-neutral-200 p-4"
                >
                    {result.correct ? (
                        <Check className="w-5 h-5 text-neutral-900 shrink-0 mt-0.5" />
                    ) : (
                        <X className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                        <p className="text-sm text-neutral-700">{result.feedback}</p>
                        {result.suggestion && (
                            <p className="text-xs text-neutral-400 mt-1 italic">
                                Alternative: &ldquo;{result.suggestion}&rdquo;
                            </p>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Submit Button */}
            {!result && (
                <button
                    onClick={handleSubmit}
                    disabled={!input.trim() || disabled || isSubmitting}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2 mt-auto",
                        !input.trim() || disabled || isSubmitting
                            ? "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                            : "bg-neutral-900 text-white hover:bg-neutral-800"
                    )}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Checking...
                        </>
                    ) : (
                        <>
                            Submit
                            <Send className="w-3.5 h-3.5" />
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
