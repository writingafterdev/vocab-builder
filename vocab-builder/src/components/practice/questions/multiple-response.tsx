'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExerciseStoryContext } from '@/lib/db/types';

interface MultipleResponseContent {
    scenario: string;
    targetPhrases: string[];
    minResponses: number;
    hints?: string[];
}

interface Props {
    question: {
        content: MultipleResponseContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

interface ResponseEvaluation {
    isValid: boolean;
    feedback: string;
}

export default function MultipleResponseQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [responses, setResponses] = useState<string[]>(['', '']);
    const [startTime] = useState(Date.now());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [evaluations, setEvaluations] = useState<ResponseEvaluation[]>([]);

    const minResponses = content.minResponses || 2;
    const targetPhrases = content.targetPhrases || [];

    const handleResponseChange = (index: number, value: string) => {
        const newResponses = [...responses];
        newResponses[index] = value;
        setResponses(newResponses);
    };

    const handleSubmit = async () => {
        if (disabled || isSubmitting) return;

        const filledResponses = responses.filter(r => r.trim().length > 0);
        if (filledResponses.length < minResponses) return;

        setIsSubmitting(true);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        try {
            const response = await fetch('/api/user/evaluate-response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionType: 'multiple_response',
                    userResponses: filledResponses,
                    targetPhrases,
                    scenario: content.scenario,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const evals = data.evaluations || filledResponses.map(() => ({
                    isValid: true,
                    feedback: 'Good response!',
                }));
                setEvaluations(evals);

                const allValid = evals.every((e: ResponseEvaluation) => e.isValid);
                setTimeout(() => {
                    onAnswer(filledResponses.join(' | '), allValid, timeTaken);
                }, 1500);
            } else {
                const evals = filledResponses.map(r => {
                    const hasPhrase = targetPhrases.some(p =>
                        r.toLowerCase().includes(p.toLowerCase())
                    );
                    return {
                        isValid: hasPhrase,
                        feedback: hasPhrase ? 'Good use of the target phrase!' : 'Try incorporating the target phrase.',
                    };
                });
                setEvaluations(evals);
                setTimeout(() => {
                    onAnswer(filledResponses.join(' | '), evals.every(e => e.isValid), timeTaken);
                }, 1500);
            }
        } catch (error) {
            const evals = filledResponses.map(() => ({
                isValid: true,
                feedback: 'Response recorded!',
            }));
            setEvaluations(evals);
            setTimeout(() => {
                onAnswer(filledResponses.join(' | '), true, timeTaken);
            }, 1000);
        }
    };

    const canSubmit = responses.filter(r => r.trim().length > 0).length >= minResponses;

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Multiple responses
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Give {minResponses}+ different responses
                </p>
            </div>

            {/* Scenario Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 mb-6"
            >
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">
                    Scenario
                </p>
                <p className="text-base text-neutral-800 leading-relaxed font-serif">
                    {content.scenario}
                </p>
                <p className="text-xs text-neutral-400 mt-3">
                    Use: <span className="text-neutral-600 font-medium">{targetPhrases.join(', ')}</span>
                </p>
            </motion.div>

            {/* Response Inputs */}
            <div className="space-y-4 flex-1">
                {responses.map((response, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <div className="relative">
                            <span className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.2em] text-neutral-300 font-medium">
                                {i + 1}
                            </span>
                            <textarea
                                value={response}
                                onChange={(e) => handleResponseChange(i, e.target.value)}
                                disabled={disabled || evaluations.length > 0}
                                placeholder={content.hints?.[i] || `Response ${i + 1}...`}
                                className={cn(
                                    "w-full p-4 pt-8 border min-h-[90px] resize-none transition-all text-sm",
                                    evaluations[i]
                                        ? evaluations[i].isValid
                                            ? 'border-neutral-900 bg-neutral-50'
                                            : 'border-neutral-300 bg-neutral-50'
                                        : 'border-neutral-200 focus:border-neutral-900 focus:outline-none'
                                )}
                            />
                        </div>
                        {evaluations[i] && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs text-neutral-500 mt-1 px-1"
                            >
                                {evaluations[i].feedback}
                            </motion.p>
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Submit Button */}
            {evaluations.length === 0 && (
                <button
                    onClick={handleSubmit}
                    disabled={disabled || !canSubmit || isSubmitting}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2 mt-6",
                        !canSubmit || disabled || isSubmitting
                            ? "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                            : "bg-neutral-900 text-white hover:bg-neutral-800"
                    )}
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            <Send className="w-3.5 h-3.5" />
                            Submit Responses
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
