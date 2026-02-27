'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmbeddedQuestion, QuestionType } from '@/lib/db/types';

interface EmbeddedQuestionCardProps {
    question: EmbeddedQuestion;
    onAnswer: (questionId: string, isCorrect: boolean) => void;
    isAnswered: boolean;
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

const questionTypeColors: Record<QuestionType, string> = {
    character_motivation: 'bg-rose-100 text-rose-700',
    outcome_consequence: 'bg-amber-100 text-amber-700',
    problem_identification: 'bg-red-100 text-red-700',
    turning_point: 'bg-purple-100 text-purple-700',
    tone_mood_shift: 'bg-indigo-100 text-indigo-700',
    relationship_dynamics: 'bg-pink-100 text-pink-700',
    attitude_reading: 'bg-orange-100 text-orange-700',
    decision_reasoning: 'bg-blue-100 text-blue-700',
    communication_intent: 'bg-teal-100 text-teal-700',
    detail_tracking: 'bg-green-100 text-green-700',
    comparison_contrast: 'bg-cyan-100 text-cyan-700',
    gap_inference: 'bg-violet-100 text-violet-700',
    perspective_analysis: 'bg-fuchsia-100 text-fuchsia-700',
};

export function EmbeddedQuestionCard({
    question,
    onAnswer,
    isAnswered
}: EmbeddedQuestionCardProps) {
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);

    const handleSubmit = () => {
        if (selectedAnswer === null) return;
        setShowResult(true);
        const isCorrect = selectedAnswer === question.correctIndex;
        onAnswer(question.id, isCorrect);
    };

    const handleContinue = () => {
        // Already answered, card will be hidden by parent
    };

    const isCorrect = selectedAnswer === question.correctIndex;

    if (isAnswered) {
        return null; // Hide answered questions
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 shadow-sm"
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                    <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-xs font-medium text-slate-500">Comprehension Check</p>
                    <Badge className={cn('text-[10px] mt-1', questionTypeColors[question.type])}>
                        {questionTypeLabels[question.type]}
                    </Badge>
                </div>
            </div>

            {/* Question */}
            <p className="text-lg font-medium text-slate-800 mb-5 leading-relaxed">
                {question.question}
            </p>

            {/* Options */}
            <div className="space-y-3 mb-6">
                {question.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrectOption = index === question.correctIndex;

                    let optionStyle = 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50';

                    if (showResult) {
                        if (isCorrectOption) {
                            optionStyle = 'bg-green-50 border-green-500 text-green-800';
                        } else if (isSelected && !isCorrectOption) {
                            optionStyle = 'bg-red-50 border-red-500 text-red-800';
                        } else {
                            optionStyle = 'bg-white border-slate-200 opacity-50';
                        }
                    } else if (isSelected) {
                        optionStyle = 'bg-blue-50 border-blue-500 ring-2 ring-blue-200';
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => !showResult && setSelectedAnswer(index)}
                            disabled={showResult}
                            className={cn(
                                'w-full p-4 text-left rounded-lg border-2 transition-all flex items-center gap-3',
                                optionStyle
                            )}
                        >
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold">
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="flex-1 text-sm">{option}</span>
                            {showResult && isCorrectOption && (
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            )}
                            {showResult && isSelected && !isCorrectOption && (
                                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
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
                        <div className={cn(
                            'p-4 rounded-lg',
                            isCorrect ? 'bg-green-100 border border-green-200' : 'bg-amber-50 border border-amber-200'
                        )}>
                            <p className={cn(
                                'font-semibold mb-1',
                                isCorrect ? 'text-green-800' : 'text-amber-800'
                            )}>
                                {isCorrect ? '✓ Correct!' : '✗ Not quite'}
                            </p>
                            {question.explanation && (
                                <p className="text-sm text-slate-600">{question.explanation}</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Action Button */}
            {!showResult ? (
                <Button
                    onClick={handleSubmit}
                    disabled={selectedAnswer === null}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                >
                    Check Answer
                </Button>
            ) : (
                <Button
                    onClick={handleContinue}
                    className="w-full bg-slate-800 hover:bg-slate-900"
                >
                    Continue Reading
                    <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </motion.div>
    );
}
