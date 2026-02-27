'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExerciseStoryContext } from '@/lib/db/types';

interface ExplainToFriendContent {
    phrase: string;
    meaning: string;
    register?: string;
    goodExampleContext?: string;
}

interface Props {
    question: {
        content: ExplainToFriendContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

interface EvaluationResult {
    score: number;
    feedback: string;
    suggestions: string[];
}

export default function ExplainToFriendQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [explanation, setExplanation] = useState('');
    const [startTime] = useState(Date.now());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

    const handleSubmit = async () => {
        if (disabled || isSubmitting || explanation.trim().length < 20) return;

        setIsSubmitting(true);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        try {
            const response = await fetch('/api/user/evaluate-response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionType: 'explain_to_friend',
                    userResponse: explanation,
                    targetPhrase: content.phrase,
                    expectedMeaning: content.meaning,
                    expectedRegister: content.register,
                    context: content.goodExampleContext,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const evalResult = {
                    score: data.score || (data.correct ? 8 : 5),
                    feedback: data.feedback || 'Good explanation!',
                    suggestions: data.suggestions || [],
                };
                setEvaluation(evalResult);

                const isGood = evalResult.score >= 6;
                setTimeout(() => {
                    onAnswer(explanation, isGood, timeTaken);
                }, 2000);
            } else {
                const hasExample = explanation.toLowerCase().includes('example') ||
                    explanation.toLowerCase().includes('for instance') ||
                    explanation.includes('"');
                const mentionsMeaning = content.meaning.split(' ').some(word =>
                    explanation.toLowerCase().includes(word.toLowerCase())
                );

                const score = (hasExample ? 4 : 0) + (mentionsMeaning ? 4 : 0);
                setEvaluation({
                    score,
                    feedback: score >= 6 ? 'Good explanation!' : 'Try including an example of when to use it.',
                    suggestions: !hasExample ? ['Add a real-world example'] : [],
                });

                setTimeout(() => {
                    onAnswer(explanation, score >= 6, timeTaken);
                }, 1500);
            }
        } catch (error) {
            setEvaluation({
                score: 7,
                feedback: 'Thanks for your explanation!',
                suggestions: [],
            });
            setTimeout(() => {
                onAnswer(explanation, true, timeTaken);
            }, 1000);
        }
    };

    const canSubmit = explanation.trim().length >= 20;

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Explain to a friend
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Describe what this phrase means and when to use it
                </p>
            </div>

            {/* Phrase Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-6 mb-8"
            >
                <p className="text-lg font-serif text-neutral-900 mb-2">
                    &ldquo;{content.phrase}&rdquo;
                </p>
                <p className="text-xs text-neutral-400">{content.meaning}</p>
                {content.register && (
                    <span className="inline-block mt-2 text-[10px] uppercase tracking-[0.2em] text-neutral-400 border border-neutral-200 px-2 py-0.5">
                        {content.register}
                    </span>
                )}
            </motion.div>

            {/* Prompt */}
            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium mb-3">
                Your Explanation
            </p>

            {/* Input */}
            <div className="flex-1 mb-4">
                <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    disabled={disabled || evaluation !== null}
                    placeholder={`"${content.phrase}" means... You'd use it when... For example...`}
                    className={cn(
                        "w-full h-full min-h-[160px] p-4 border resize-none transition-all text-sm",
                        evaluation
                            ? evaluation.score >= 6
                                ? 'border-neutral-900 bg-neutral-50'
                                : 'border-neutral-300 bg-neutral-50'
                            : 'border-neutral-200 focus:border-neutral-900 focus:outline-none'
                    )}
                />
                <div className="flex justify-between mt-2 text-[10px] text-neutral-300 uppercase tracking-wider">
                    <span>{explanation.length} characters</span>
                    <span>{explanation.length < 20 ? 'Min 20' : 'Ready'}</span>
                </div>
            </div>

            {/* Evaluation */}
            {evaluation && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-neutral-200 p-4 mb-4"
                >
                    <p className="text-sm text-neutral-700">{evaluation.feedback}</p>
                    {evaluation.suggestions.length > 0 && (
                        <ul className="mt-2 text-xs text-neutral-400 space-y-1">
                            {evaluation.suggestions.map((s, i) => (
                                <li key={i}>• {s}</li>
                            ))}
                        </ul>
                    )}
                </motion.div>
            )}

            {/* Submit */}
            {!evaluation && (
                <button
                    onClick={handleSubmit}
                    disabled={disabled || !canSubmit || isSubmitting}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2",
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
                            Submit
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
