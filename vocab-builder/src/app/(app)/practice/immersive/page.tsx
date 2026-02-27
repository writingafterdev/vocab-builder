'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import { SpinnerGap, BookOpen, Headphones, ArrowLeft, Check, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SpeakButton } from '@/hooks/use-text-to-speech';

interface Question {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
}

interface ImmersiveSession {
    title: string;
    content: string;
    format: 'article' | 'dialogue';
    questions: Question[];
    phrases: Array<{ id: string; phrase: string; meaning: string }>;
    mode: 'reading' | 'listening';
}

type SessionState = 'select' | 'loading' | 'content' | 'questions' | 'complete';

export default function ImmersivePage() {
    const router = useRouter();
    const { user } = useAuth();

    const [state, setState] = useState<SessionState>('select');
    const [mode, setMode] = useState<'reading' | 'listening'>('reading');
    const [session, setSession] = useState<ImmersiveSession | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);

    // Generate session
    async function generateSession(selectedMode: 'reading' | 'listening') {
        if (!user) return;

        setState('loading');
        setMode(selectedMode);

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/immersive-session/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid,
                },
                body: JSON.stringify({ mode: selectedMode }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to generate');
            }

            const data = await res.json();
            setSession(data);
            setState('content');
        } catch (error) {
            console.error('Generate error:', error);
            toast.error('Failed to generate session');
            setState('select');
        }
    }

    // Submit answer
    function handleAnswer(answer: string) {
        setSelectedAnswer(answer);
        setShowResult(true);

        if (answer === session?.questions[currentQuestion].correctAnswer) {
            setCorrectCount(prev => prev + 1);
        }
    }

    // Next question
    function handleNext() {
        setSelectedAnswer(null);
        setShowResult(false);

        if (currentQuestion < (session?.questions.length || 0) - 1) {
            setCurrentQuestion(prev => prev + 1);
        } else {
            completeSession();
        }
    }

    // Complete session
    async function completeSession() {
        if (!user || !session) return;

        setState('complete');

        try {
            const token = await user.getIdToken();
            await fetch('/api/immersive-session/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid,
                },
                body: JSON.stringify({
                    phrases: session.phrases,
                    correctCount,
                    totalQuestions: session.questions.length,
                    mode,
                }),
            });
        } catch (error) {
            console.error('Complete error:', error);
        }
    }

    // Highlight phrases in content
    function highlightContent(text: string) {
        if (!session?.phrases) return text;

        let highlighted = text;
        for (const p of session.phrases) {
            const regex = new RegExp(`(${p.phrase})`, 'gi');
            highlighted = highlighted.replace(regex,
                `<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>`
            );
        }
        return highlighted;
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <SpinnerGap className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => router.push('/practice')}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-2xl font-bold">Immersive Mode</h1>
                </div>

                {/* Mode Selection */}
                {state === 'select' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <p className="text-center text-slate-600 dark:text-slate-400">
                            Choose your practice style
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => generateSession('reading')}
                                className="p-6 rounded-2xl border-2 border-blue-200 hover:border-blue-500 bg-blue-50 hover:bg-blue-100 transition-all group"
                            >
                                <BookOpen className="w-12 h-12 mx-auto mb-4 text-blue-500 group-hover:scale-110 transition-transform" />
                                <h3 className="font-bold text-lg">Reading</h3>
                                <p className="text-sm text-slate-600 mt-1">Focus on text</p>
                            </button>

                            <button
                                onClick={() => generateSession('listening')}
                                className="p-6 rounded-2xl border-2 border-purple-200 hover:border-purple-500 bg-purple-50 hover:bg-purple-100 transition-all group"
                            >
                                <Headphones className="w-12 h-12 mx-auto mb-4 text-purple-500 group-hover:scale-110 transition-transform" />
                                <h3 className="font-bold text-lg">Listening</h3>
                                <p className="text-sm text-slate-600 mt-1">Focus on audio</p>
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Loading */}
                {state === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <SpinnerGap className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                        <p className="text-slate-600">Generating your {mode} session...</p>
                    </div>
                )}

                {/* Content View */}
                {state === 'content' && session && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold">{session.title}</h2>
                            {mode === 'listening' && (
                                <SpeakButton text={session.content} />
                            )}
                        </div>

                        <div
                            className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: highlightContent(session.content) }}
                        />

                        <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
                            <h4 className="font-semibold mb-2">Phrases in this session:</h4>
                            <div className="flex flex-wrap gap-2">
                                {session.phrases.map((p) => (
                                    <span key={p.id} className="px-2 py-1 bg-yellow-200 dark:bg-yellow-800 rounded text-sm">
                                        {p.phrase}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <Button
                            onClick={() => setState('questions')}
                            className="w-full"
                        >
                            Start Questions
                        </Button>
                    </motion.div>
                )}

                {/* Questions */}
                {state === 'questions' && session && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500">
                                Question {currentQuestion + 1} of {session.questions.length}
                            </span>
                            <span className="text-sm font-medium text-green-600">
                                {correctCount} correct
                            </span>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border">
                            <h3 className="text-lg font-semibold mb-4">
                                {session.questions[currentQuestion].question}
                            </h3>

                            <div className="space-y-3">
                                {session.questions[currentQuestion].options.map((option, i) => {
                                    const isSelected = selectedAnswer === option;
                                    const isCorrect = option === session.questions[currentQuestion].correctAnswer;

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => !showResult && handleAnswer(option)}
                                            disabled={showResult}
                                            className={cn(
                                                "w-full p-4 rounded-lg text-left transition-all border",
                                                !showResult && "hover:border-blue-500 hover:bg-blue-50",
                                                showResult && isCorrect && "border-green-500 bg-green-50",
                                                showResult && isSelected && !isCorrect && "border-red-500 bg-red-50",
                                                !showResult && isSelected && "border-blue-500 bg-blue-50"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span>{option}</span>
                                                {showResult && isCorrect && <Check className="w-5 h-5 text-green-600" />}
                                                {showResult && isSelected && !isCorrect && <X className="w-5 h-5 text-red-600" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {showResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg"
                                >
                                    <p className="text-sm">{session.questions[currentQuestion].explanation}</p>
                                </motion.div>
                            )}
                        </div>

                        {showResult && (
                            <Button onClick={handleNext} className="w-full">
                                {currentQuestion < session.questions.length - 1 ? 'Next Question' : 'Finish'}
                            </Button>
                        )}
                    </motion.div>
                )}

                {/* Complete */}
                {state === 'complete' && session && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-12"
                    >
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                            <Check className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
                        <p className="text-slate-600 mb-6">
                            You got {correctCount} of {session.questions.length} correct
                        </p>
                        <Button onClick={() => router.push('/practice')}>
                            Back to Practice
                        </Button>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
