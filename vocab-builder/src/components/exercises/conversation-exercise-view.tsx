'use client';

import { useState, useEffect, useRef } from 'react';
import { ConversationExercise, ConversationScene, ConversationMessage, ConversationComprehensionQuestion } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlayCircle, CheckCircle2, MessageCircle, ArrowRight, User, GraduationCap, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ConversationExerciseViewProps {
    exercise: ConversationExercise;
    onComplete: (result: {
        score: number;
        total: number;
        answers: Record<string, number>;
    }) => void;
    onExit: () => void;
}

export default function ConversationExerciseView({
    exercise,
    onComplete,
    onExit
}: ConversationExerciseViewProps) {
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
    const [visibleMessageCount, setVisibleMessageCount] = useState(0);
    const [showQuestions, setShowQuestions] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [score, setScore] = useState(0);
    const [completed, setCompleted] = useState(false);

    const currentScene = exercise.scenes[currentSceneIndex];
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [visibleMessageCount, currentSceneIndex]);

    const handleNextMessage = () => {
        if (visibleMessageCount < currentScene.messages.length) {
            setVisibleMessageCount(prev => prev + 1);
        } else if (currentSceneIndex < exercise.scenes.length - 1) {
            setCurrentSceneIndex(prev => prev + 1);
            setVisibleMessageCount(0);
        } else {
            setShowQuestions(true);
        }
    };

    const handleAnswerQuestion = (optionIndex: number) => {
        const question = exercise.questions[currentQuestionIndex];
        const isCorrect = optionIndex === question.correctIndex;

        setAnswers(prev => ({ ...prev, [question.id]: optionIndex }));
        if (isCorrect) setScore(prev => prev + 1);

        // Delay to show feedback before moving next
        setTimeout(() => {
            if (currentQuestionIndex < exercise.questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            } else {
                setCompleted(true);
                onComplete({
                    score: score + (isCorrect ? 1 : 0),
                    total: exercise.questions.length,
                    answers: { ...answers, [question.id]: optionIndex }
                });
            }
        }, 1500);
    };

    if (completed) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 text-center space-y-6">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Practice Completed!</h2>
                <p className="text-slate-600">
                    You scored {score}/{exercise.questions.length} on comprehension.
                </p>
                <div className="flex justify-center gap-4 pt-4">
                    <Button onClick={onExit} variant="outline">Exit</Button>
                    <Button onClick={() => window.location.reload()}>Practice Again</Button>
                </div>
            </div>
        );
    }

    if (showQuestions) {
        const question = exercise.questions[currentQuestionIndex];
        const hasAnswered = answers[question.id] !== undefined;

        return (
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Question {currentQuestionIndex + 1} of {exercise.questions.length}</span>
                    <span className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        Comprehension Check
                    </span>
                </div>

                <Card className="p-6 space-y-6">
                    <h3 className="text-xl font-semibold text-slate-900">{question.question}</h3>
                    <div className="space-y-3">
                        {question.options.map((option, idx) => {
                            const isSelected = answers[question.id] === idx;
                            const isCorrect = question.correctIndex === idx;

                            let buttonClass = "w-full justify-start text-left text-base py-4 h-auto";
                            if (hasAnswered) {
                                if (isCorrect) buttonClass += " bg-green-100 text-green-800 border-green-200 hover:bg-green-100";
                                else if (isSelected) buttonClass += " bg-red-100 text-red-800 border-red-200 hover:bg-red-100";
                                else buttonClass += " opacity-60";
                            }

                            return (
                                <Button
                                    key={idx}
                                    variant="outline"
                                    className={buttonClass}
                                    onClick={() => !hasAnswered && handleAnswerQuestion(idx)}
                                    disabled={hasAnswered}
                                >
                                    <div className="flex items-center gap-3 w-full">
                                        <div className={cn(
                                            "w-6 h-6 rounded-full border flex items-center justify-center text-xs flex-shrink-0",
                                            hasAnswered && isCorrect ? "border-green-500 bg-green-50 text-green-700" :
                                                hasAnswered && isSelected ? "border-red-500 bg-red-50 text-red-700" :
                                                    "border-slate-300 text-slate-500"
                                        )}>
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <span>{option}</span>
                                    </div>
                                </Button>
                            );
                        })}
                    </div>
                    {hasAnswered && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600"
                        >
                            <p className="font-medium text-slate-900 mb-1">Explanation</p>
                            {question.explanation}
                        </motion.div>
                    )}
                </Card>
            </div>
        );
    }

    // Render Conversation Flow
    return (
        <div className="max-w-2xl mx-auto py-6 px-4 pb-32">
            {/* Header */}
            <header className="mb-8 space-y-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-900">{exercise.title}</h1>
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded-full text-slate-600 uppercase tracking-wider">
                        {currentScene.register}
                    </span>
                </div>
                <p className="text-slate-600">{exercise.description}</p>
            </header>

            {/* Scene Intro */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`scene-${currentSceneIndex}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="mb-8 bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-indigo-900 text-sm leading-relaxed flex gap-3"
                >
                    <MapPin className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <div className="font-semibold mb-1 text-indigo-700">
                            Scene {currentSceneIndex + 1}: {currentScene.location || 'Unknown Location'}
                        </div>
                        {currentScene.sceneIntro || currentScene.description}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Messages */}
            <div className="space-y-6">
                {currentScene.messages.slice(0, visibleMessageCount + 1).map((msg, idx) => {
                    const isUser = msg.speakerId === 'user';
                    return (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, x: isUser ? 20 : -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn(
                                "flex gap-4 max-w-[85%]",
                                isUser ? "ml-auto flex-row-reverse" : ""
                            )}
                        >
                            {!isUser && (
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">
                                    {msg.speakerName.charAt(0)}
                                </div>
                            )}

                            <div className={cn(
                                "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                                isUser
                                    ? "bg-blue-600 text-white rounded-tr-none"
                                    : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                            )}>
                                {!isUser && (
                                    <div className="text-xs font-semibold text-slate-400 mb-1">
                                        {msg.speakerName}
                                    </div>
                                )}
                                {msg.text}
                            </div>
                        </motion.div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Controls */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-sm border-t border-slate-200">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <Button variant="ghost" onClick={onExit}>Exit</Button>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">
                            Scene {currentSceneIndex + 1}/{exercise.scenes.length} •
                            Msg {Math.min(visibleMessageCount + 1, currentScene.messages.length)}/{currentScene.messages.length}
                        </span>
                        <Button onClick={handleNextMessage} className="gap-2">
                            {visibleMessageCount < currentScene.messages.length - 1 ? 'Next' :
                                currentSceneIndex < exercise.scenes.length - 1 ? 'Next Scene' : 'Start Quiz'}
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
