'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, HelpCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmbeddedQuestion, QuestionType } from '@/lib/db/types';

interface EmbeddedQuestionCardProps {
    question: EmbeddedQuestion;
    onAnswer: (questionId: string, isCorrect: boolean) => void;
    isAnswered: boolean;
    /** Compact mode for swipe cards (less padding) */
    compact?: boolean;
}

const questionTypeLabels: Record<QuestionType, string> = {
    character_motivation: 'Motivation',
    outcome_consequence: 'Consequence',
    problem_identification: 'Problem',
    turning_point: 'Turning Point',
    tone_mood_shift: 'Tone Shift',
    relationship_dynamics: 'Dynamics',
    attitude_reading: 'Attitude',
    decision_reasoning: 'Reasoning',
    communication_intent: 'Intent',
    detail_tracking: 'Detail',
    comparison_contrast: 'Comparison',
    gap_inference: 'Inference',
    perspective_analysis: 'Perspective',
};

export function EmbeddedQuestionCard({
    question,
    onAnswer,
    isAnswered,
    compact = false,
}: EmbeddedQuestionCardProps) {
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);

    const handleSubmit = () => {
        if (selectedAnswer === null) return;
        setShowResult(true);
        const isCorrect = selectedAnswer === question.correctIndex;
        onAnswer(question.id, isCorrect);
    };

    const isCorrect = selectedAnswer === question.correctIndex;

    if (isAnswered) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'bg-neutral-50 border border-neutral-200',
                compact ? 'p-5' : 'my-8 p-6'
            )}
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-neutral-900 flex items-center justify-center">
                    <HelpCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                        Comprehension Check
                    </p>
                    <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide">
                        {questionTypeLabels[question.type]}
                    </span>
                </div>
            </div>

            {/* Question */}
            <p
                className="text-base font-normal text-neutral-800 mb-5 leading-relaxed"
                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
            >
                {question.question}
            </p>

            {/* Options */}
            <div className="space-y-2.5 mb-5">
                {question.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrectOption = index === question.correctIndex;

                    let optionStyle = 'bg-white border-neutral-200 hover:border-neutral-400';

                    if (showResult) {
                        if (isCorrectOption) {
                            optionStyle = 'bg-emerald-50 border-emerald-400 text-emerald-900';
                        } else if (isSelected && !isCorrectOption) {
                            optionStyle = 'bg-red-50 border-red-400 text-red-900';
                        } else {
                            optionStyle = 'bg-white border-neutral-200 opacity-40';
                        }
                    } else if (isSelected) {
                        optionStyle = 'bg-neutral-900 border-neutral-900 text-white';
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => !showResult && setSelectedAnswer(index)}
                            disabled={showResult}
                            className={cn(
                                'w-full p-3.5 text-left border transition-all flex items-center gap-3 text-sm',
                                optionStyle
                            )}
                        >
                            <span
                                className={cn(
                                    'flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-semibold',
                                    showResult && isCorrectOption
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : showResult && isSelected && !isCorrectOption
                                            ? 'bg-red-100 text-red-700'
                                            : isSelected
                                                ? 'bg-white/20 text-white'
                                                : 'bg-neutral-100 text-neutral-500'
                                )}
                            >
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="flex-1">{option}</span>
                            {showResult && isCorrectOption && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            )}
                            {showResult && isSelected && !isCorrectOption && (
                                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Result & Explanation */}
            <AnimatePresence>
                {showResult && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-4"
                    >
                        <div
                            className={cn(
                                'p-4 border',
                                isCorrect
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : 'bg-amber-50 border-amber-200'
                            )}
                        >
                            <p
                                className={cn(
                                    'font-semibold text-sm mb-1',
                                    isCorrect ? 'text-emerald-800' : 'text-amber-800'
                                )}
                            >
                                {isCorrect ? '✓ Correct!' : '✗ Not quite'}
                            </p>
                            {question.explanation && (
                                <p className="text-sm text-neutral-600 leading-relaxed">
                                    {question.explanation}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Action Button */}
            {!showResult ? (
                <button
                    onClick={handleSubmit}
                    disabled={selectedAnswer === null}
                    className={cn(
                        'w-full py-3 text-sm font-semibold uppercase tracking-[0.05em] transition-colors',
                        selectedAnswer === null
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-neutral-900 text-white hover:bg-neutral-800'
                    )}
                >
                    Check Answer
                </button>
            ) : (
                <button
                    onClick={() => {/* parent controls continue */ }}
                    className="w-full py-3 text-sm font-semibold uppercase tracking-[0.05em] bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                >
                    Continue Reading
                    <ChevronRight className="w-4 h-4" />
                </button>
            )}
        </motion.div>
    );
}
