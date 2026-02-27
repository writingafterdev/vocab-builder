'use client';

import { useState, useEffect } from 'react';
import {
    ConversationExercise,
    ConversationScene,
    ConversationMessage,
    ConversationComprehensionQuestion
} from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronRight, CheckCircle, XCircle, MessageCircle, MapPin, BookOpen, Headphones, Calendar } from 'lucide-react';
import { ListeningMode } from '@/components/listening-mode';

interface ConversationExerciseViewProps {
    exercise: ConversationExercise;
    onPhraseClick?: (phrase: string, context: string) => void;
    onComplete?: (score: number, total: number) => void;
}

type Stage = 'reading' | 'listening' | 'questions' | 'complete';

/**
 * Get today's exercise mode based on day of year
 * Even days = Reading, Odd days = Listening
 */
function getTodayMode(): 'reading' | 'listening' {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dayOfYear % 2 === 0 ? 'reading' : 'listening';
}

export function ConversationExerciseView({
    exercise,
    onPhraseClick,
    onComplete,
}: ConversationExerciseViewProps) {
    const [todayMode, setTodayMode] = useState<'reading' | 'listening'>('reading');
    const [stage, setStage] = useState<Stage>('reading');
    const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [showExplanation, setShowExplanation] = useState(false);

    // Set today's mode on mount
    useEffect(() => {
        const mode = getTodayMode();
        setTodayMode(mode);
        setStage(mode);
    }, []);

    const currentScene = exercise.scenes[currentSceneIndex];
    const currentQuestion = exercise.questions[currentQuestionIndex];

    const handleNextScene = () => {
        if (currentSceneIndex < exercise.scenes.length - 1) {
            setCurrentSceneIndex(currentSceneIndex + 1);
        } else {
            setStage('questions');
        }
    };

    const handleSelectAnswer = (questionId: string, answerIndex: number) => {
        setAnswers({ ...answers, [questionId]: answerIndex });
        setShowExplanation(true);
    };

    const handleNextQuestion = () => {
        setShowExplanation(false);
        if (currentQuestionIndex < exercise.questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            // Calculate score
            const correct = exercise.questions.filter(
                q => answers[q.id] === q.correctIndex
            ).length;
            setStage('complete');
            onComplete?.(correct, exercise.questions.length);
        }
    };

    const score = exercise.questions.filter(q => answers[q.id] === q.correctIndex).length;

    return (
        <div className="max-w-2xl mx-auto p-4">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-xl font-bold">{exercise.title}</h2>
                {exercise.description && (
                    <p className="text-slate-600 text-sm mt-1">{exercise.description}</p>
                )}

                {/* Today's Mode Indicator */}
                {(stage === 'reading' || stage === 'listening') && (
                    <div className="flex items-center gap-3 mt-4">
                        <div className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl font-medium",
                            todayMode === 'reading'
                                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
                                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                        )}>
                            {todayMode === 'reading' ? (
                                <>
                                    <BookOpen className="w-4 h-4" />
                                    <span>Reading Day</span>
                                </>
                            ) : (
                                <>
                                    <Headphones className="w-4 h-4" />
                                    <span>Listening Day</span>
                                </>
                            )}
                        </div>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Alternates daily
                        </span>
                    </div>
                )}

                {/* Progress */}
                <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
                    {stage === 'reading' && (
                        <>
                            <MapPin className="w-4 h-4" />
                            Scene {currentSceneIndex + 1} of {exercise.scenes.length}
                        </>
                    )}
                    {stage === 'listening' && (
                        <>
                            <Headphones className="w-4 h-4" />
                            Listen to the conversation
                        </>
                    )}
                    {stage === 'questions' && (
                        <>
                            <MessageCircle className="w-4 h-4" />
                            Question {currentQuestionIndex + 1} of {exercise.questions.length}
                        </>
                    )}
                </div>
            </div>

            {/* Reading Stage */}
            {stage === 'reading' && currentScene && (
                <div className="space-y-4">
                    {exercise.format === 'real_life' ? (
                        <RealLifeScene
                            scene={currentScene}
                            onPhraseClick={onPhraseClick}
                        />
                    ) : (
                        <ChatScene
                            scene={currentScene}
                            onPhraseClick={onPhraseClick}
                        />
                    )}

                    <Button
                        onClick={handleNextScene}
                        className="w-full mt-6"
                    >
                        {currentSceneIndex < exercise.scenes.length - 1
                            ? 'Next Scene'
                            : 'Start Questions'
                        }
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            )}

            {/* Listening Stage */}
            {stage === 'listening' && (
                <div className="space-y-4">
                    <ListeningMode
                        messages={exercise.scenes.flatMap(scene => scene.messages)}
                        onComplete={() => setStage('questions')}
                    />

                    <Button
                        onClick={() => setStage('questions')}
                        variant="outline"
                        className="w-full mt-4"
                    >
                        Skip to Questions
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            )}

            {/* Questions Stage */}
            {stage === 'questions' && currentQuestion && (
                <ComprehensionQuestionCard
                    question={currentQuestion}
                    selectedAnswer={answers[currentQuestion.id]}
                    showExplanation={showExplanation}
                    onSelectAnswer={(idx) => handleSelectAnswer(currentQuestion.id, idx)}
                    onNext={handleNextQuestion}
                />
            )}

            {/* Complete Stage */}
            {stage === 'complete' && (
                <div className="text-center py-12">
                    <div className="text-5xl mb-4">
                        {score === exercise.questions.length ? '🎉' : score >= exercise.questions.length / 2 ? '👍' : '💪'}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">
                        {score === exercise.questions.length ? 'Perfect!' : 'Good effort!'}
                    </h3>
                    <p className="text-lg text-slate-600">
                        You got {score} out of {exercise.questions.length} correct
                    </p>
                    <div className="mt-4 text-sm text-slate-500">
                        {score === exercise.questions.length
                            ? 'You understand register and nuance differences perfectly!'
                            : 'Keep practicing to master register switching!'}
                    </div>
                </div>
            )}
        </div>
    );
}

// Real-life scene with location header
function RealLifeScene({
    scene,
    onPhraseClick
}: {
    scene: ConversationScene;
    onPhraseClick?: (phrase: string, context: string) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Location header */}
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-slate-500" />
                    <span className="font-medium">{scene.location || 'Scene'}</span>
                    <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full ml-auto",
                        scene.register === 'casual' && "bg-green-100 text-green-700",
                        scene.register === 'consultative' && "bg-blue-100 text-blue-700",
                        scene.register === 'formal' && "bg-purple-100 text-purple-700"
                    )}>
                        {scene.register}
                    </span>
                </div>
                {scene.description && (
                    <p className="text-sm text-slate-500 mt-1">{scene.description}</p>
                )}
            </div>

            {/* Messages */}
            <div className="p-4 space-y-4 bg-white">
                {scene.messages.map((message) => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        isUser={message.speakerId === 'user'}
                        onPhraseClick={onPhraseClick}
                    />
                ))}
            </div>
        </div>
    );
}

// Chat scene (WhatsApp style)
function ChatScene({
    scene,
    onPhraseClick
}: {
    scene: ConversationScene;
    onPhraseClick?: (phrase: string, context: string) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Chat header */}
            <div className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-3 text-white">
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    <span className="font-medium">{scene.location || 'Group Chat'}</span>
                </div>
            </div>

            {/* Scene transition notification */}
            {scene.description && (
                <div className="text-center py-2 text-xs text-slate-500 bg-slate-50">
                    {scene.description}
                </div>
            )}

            {/* Messages */}
            <div className="p-4 space-y-3 bg-slate-50 min-h-[200px]">
                {scene.messages.map((message) => (
                    <ChatBubble
                        key={message.id}
                        message={message}
                        isUser={message.speakerId === 'user'}
                        onPhraseClick={onPhraseClick}
                    />
                ))}
            </div>
        </div>
    );
}

// Message bubble for real-life format
function MessageBubble({
    message,
    isUser,
    onPhraseClick
}: {
    message: ConversationMessage;
    isUser: boolean;
    onPhraseClick?: (phrase: string, context: string) => void;
}) {
    const highlightPhrases = (text: string, phrases: string[] = []) => {
        if (!phrases.length) return text;

        let result = text;
        phrases.forEach(phrase => {
            const regex = new RegExp(`(${phrase})`, 'gi');
            result = result.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded cursor-pointer hover:bg-yellow-300">$1</mark>');
        });
        return result;
    };

    return (
        <div className={cn("flex", isUser && "justify-end")}>
            <div className={cn(
                "max-w-[80%]",
                isUser ? "text-right" : "text-left"
            )}>
                <span className="text-xs font-medium text-slate-600 mb-1 block">
                    {message.speakerName}
                </span>
                <div
                    className={cn(
                        "inline-block px-4 py-2 rounded-2xl",
                        isUser
                            ? "bg-blue-500 text-white rounded-br-none"
                            : "bg-slate-200 text-slate-800 rounded-bl-none"
                    )}
                    onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'MARK' && onPhraseClick) {
                            onPhraseClick(target.textContent || '', message.text);
                        }
                    }}
                    dangerouslySetInnerHTML={{
                        __html: highlightPhrases(message.text, message.highlightedPhrases)
                    }}
                />
            </div>
        </div>
    );
}

// Chat bubble for WhatsApp style
function ChatBubble({
    message,
    isUser,
    onPhraseClick
}: {
    message: ConversationMessage;
    isUser: boolean;
    onPhraseClick?: (phrase: string, context: string) => void;
}) {
    const highlightPhrases = (text: string, phrases: string[] = []) => {
        if (!phrases.length) return text;

        let result = text;
        phrases.forEach(phrase => {
            const regex = new RegExp(`(${phrase})`, 'gi');
            result = result.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded cursor-pointer hover:bg-yellow-300">$1</mark>');
        });
        return result;
    };

    return (
        <div className={cn("flex", isUser && "justify-end")}>
            <div className={cn(
                "max-w-[80%] px-3 py-2 rounded-lg shadow-sm",
                isUser ? "bg-green-100" : "bg-white"
            )}>
                {!isUser && (
                    <span className="text-xs font-medium text-green-700 mb-0.5 block">
                        {message.speakerName}
                    </span>
                )}
                <div
                    className="text-sm"
                    onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'MARK' && onPhraseClick) {
                            onPhraseClick(target.textContent || '', message.text);
                        }
                    }}
                    dangerouslySetInnerHTML={{
                        __html: highlightPhrases(message.text, message.highlightedPhrases)
                    }}
                />
            </div>
        </div>
    );
}

// Comprehension question card
function ComprehensionQuestionCard({
    question,
    selectedAnswer,
    showExplanation,
    onSelectAnswer,
    onNext,
}: {
    question: ConversationComprehensionQuestion;
    selectedAnswer?: number;
    showExplanation: boolean;
    onSelectAnswer: (index: number) => void;
    onNext: () => void;
}) {
    const hasAnswered = selectedAnswer !== undefined;
    const isCorrect = selectedAnswer === question.correctIndex;

    return (
        <div className="rounded-xl border border-slate-200 p-6 bg-white">
            {/* Question type badge */}
            <div className="mb-4">
                <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    question.type === 'register_shift' && "bg-purple-100 text-purple-700",
                    question.type === 'formal_equivalent' && "bg-blue-100 text-blue-700",
                    question.type === 'casual_equivalent' && "bg-green-100 text-green-700",
                    question.type === 'appropriate_choice' && "bg-orange-100 text-orange-700",
                    question.type === 'nuance_detection' && "bg-pink-100 text-pink-700"
                )}>
                    {question.type.replace(/_/g, ' ')}
                </span>
            </div>

            {/* Question */}
            <h3 className="text-lg font-medium mb-4">{question.question}</h3>

            {/* Options */}
            <div className="space-y-2">
                {question.options.map((option, idx) => (
                    <button
                        key={idx}
                        onClick={() => !hasAnswered && onSelectAnswer(idx)}
                        disabled={hasAnswered}
                        className={cn(
                            "w-full text-left px-4 py-3 rounded-lg border transition-all",
                            !hasAnswered && "hover:border-blue-400 hover:bg-blue-50",
                            hasAnswered && idx === question.correctIndex && "border-green-500 bg-green-50",
                            hasAnswered && idx === selectedAnswer && idx !== question.correctIndex && "border-red-500 bg-red-50",
                            hasAnswered && idx !== selectedAnswer && idx !== question.correctIndex && "opacity-50"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full border flex items-center justify-center text-sm">
                                {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="flex-1">{option}</span>
                            {hasAnswered && idx === question.correctIndex && (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                            {hasAnswered && idx === selectedAnswer && idx !== question.correctIndex && (
                                <XCircle className="w-5 h-5 text-red-500" />
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* Explanation */}
            {showExplanation && (
                <div className={cn(
                    "mt-4 p-4 rounded-lg",
                    isCorrect ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
                )}>
                    <p className="text-sm">
                        {isCorrect ? '✓ Correct! ' : '✗ '}{question.explanation}
                    </p>
                </div>
            )}

            {/* Next button */}
            {showExplanation && (
                <Button onClick={onNext} className="w-full mt-4">
                    Next <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
            )}
        </div>
    );
}
