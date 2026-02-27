'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, ArrowRight, BookOpen, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ComprehensionQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
}

interface RelatedExpression {
    phrase: string;
    meaning: string;
    type: string;
    parentPhrase: string;
    parentPhraseId?: string;
}

interface PassiveStoryViewProps {
    article: {
        title: string;
        content: string;
        questions: ComprehensionQuestion[];
        relatedExpressions?: RelatedExpression[];
    };
    onComplete: (score: number) => void;
    onSavePhrase?: (expression: RelatedExpression) => void;
}

export function PassiveStoryView({ article, onComplete, onSavePhrase }: PassiveStoryViewProps) {
    const [mode, setMode] = useState<'reading' | 'quiz'>('reading');
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [savedPhrases, setSavedPhrases] = useState<Set<string>>(new Set());

    // Render content with clickable highlighted phrases
    const renderHighlightedContent = (content: string) => {
        const relatedExpressions = article.relatedExpressions || [];
        if (relatedExpressions.length === 0) {
            return <span className="whitespace-pre-line">{content}</span>;
        }

        // Sort by phrase length (longest first) to avoid partial matches
        const sortedExpressions = [...relatedExpressions].sort(
            (a, b) => b.phrase.length - a.phrase.length
        );

        // Build regex pattern for all phrases
        const pattern = sortedExpressions
            .map(e => e.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');

        // Split content by matches
        const parts = content.split(regex);

        return (
            <>
                {parts.map((part, index) => {
                    const matchedExpression = sortedExpressions.find(
                        e => e.phrase.toLowerCase() === part.toLowerCase()
                    );

                    if (matchedExpression) {
                        const isSaved = savedPhrases.has(matchedExpression.phrase.toLowerCase());

                        return (
                            <span
                                key={index}
                                onClick={() => {
                                    if (!isSaved && onSavePhrase) {
                                        onSavePhrase(matchedExpression);
                                        setSavedPhrases(prev => new Set(prev).add(matchedExpression.phrase.toLowerCase()));
                                    }
                                }}
                                className={`
                                    inline-flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer
                                    transition-all duration-200 whitespace-pre-line
                                    ${isSaved
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        : 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:ring-2 hover:ring-blue-300'
                                    }
                                `}
                                title={isSaved ? 'Already saved!' : `Click to save: ${matchedExpression.meaning}`}
                            >
                                {part}
                                {!isSaved && <Plus className="w-3 h-3 opacity-70" />}
                            </span>
                        );
                    }

                    return <span key={index} className="whitespace-pre-line">{part}</span>;
                })}
            </>
        );
    };

    const handleNext = () => {
        if (currentQuestionIndex < article.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedOption(null);
            setIsAnswered(false);
        } else {
            // Finish
            onComplete(score);
        }
    };

    const handleAnswer = (index: number) => {
        if (isAnswered) return;
        setSelectedOption(index);
        setIsAnswered(true);

        if (index === article.questions[currentQuestionIndex].correctIndex) {
            setScore(prev => prev + 1);
        }
    };

    if (mode === 'reading') {
        return (
            <div className="space-y-6 max-w-2xl mx-auto">
                <Card className="p-8 bg-white border-slate-200 shadow-sm">
                    {/* Simple Header */}
                    <div className="mb-6 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                            <BookOpen className="w-4 h-4" />
                            <span>Quick Read</span>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800">
                            {article.title}
                        </h2>
                    </div>

                    {/* Story Content - Clean Typography with Clickable Phrases */}
                    <ScrollArea className="h-[50vh] pr-4">
                        <div className="prose prose-slate prose-base text-slate-700 leading-relaxed">
                            {renderHighlightedContent(article.content)}
                        </div>
                    </ScrollArea>

                    {/* Simple Next Button */}
                    <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                        <Button
                            onClick={() => setMode('quiz')}
                            className="bg-slate-800 hover:bg-slate-900 text-white rounded-full px-6"
                        >
                            Check Understanding <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    const question = article.questions[currentQuestionIndex];

    return (
        <div className="max-w-xl mx-auto py-12">
            <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
                <span>Question {currentQuestionIndex + 1} of {article.questions.length}</span>
                <span>Score: {score}</span>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentQuestionIndex}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                >
                    <Card className="p-6 shadow-md border-slate-200">
                        <h3 className="text-xl font-medium text-slate-800 mb-6">
                            {question.question}
                        </h3>

                        <div className="space-y-3">
                            {question.options.map((option, idx) => {
                                let variant = "outline";
                                let className = "w-full justify-start text-left h-auto py-4 px-4 border-slate-200 hover:bg-slate-50";

                                if (isAnswered) {
                                    if (idx === question.correctIndex) {
                                        className = "w-full justify-start text-left h-auto py-4 px-4 bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500";
                                    } else if (idx === selectedOption) {
                                        className = "w-full justify-start text-left h-auto py-4 px-4 bg-red-50 border-red-500 text-red-700";
                                    } else {
                                        className = "w-full justify-start text-left h-auto py-4 px-4 opacity-50";
                                    }
                                }

                                return (
                                    <Button
                                        key={idx}
                                        variant="ghost"
                                        className={className}
                                        onClick={() => handleAnswer(idx)}
                                        disabled={isAnswered}
                                    >
                                        <div className="flex items-center w-full">
                                            <span className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs mr-3 shrink-0 text-slate-500 font-mono">
                                                {String.fromCharCode(65 + idx)}
                                            </span>
                                            <span className="flex-1">{option}</span>
                                            {isAnswered && idx === question.correctIndex && (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600 ml-2" />
                                            )}
                                            {isAnswered && idx === selectedOption && idx !== question.correctIndex && (
                                                <XCircle className="w-5 h-5 text-red-500 ml-2" />
                                            )}
                                        </div>
                                    </Button>
                                );
                            })}
                        </div>

                        {isAnswered && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-6 pt-4 border-t border-slate-100"
                            >
                                <p className="text-slate-600 text-sm italic mb-4">
                                    {question.explanation}
                                </p>
                                <Button onClick={handleNext} className="w-full">
                                    {currentQuestionIndex < article.questions.length - 1 ? 'Next Question' : 'Finish Reading'}
                                </Button>
                            </motion.div>
                        )}
                    </Card>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
