'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, ArrowRight, Headphones, Eye, EyeOff, Play, Pause, RotateCcw, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface ComprehensionQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
}

interface PassiveListeningViewProps {
    article: {
        title: string;
        content: string;
        questions: ComprehensionQuestion[];
        audioBase64?: string;
        audioMimeType?: string;
        preGeneratedAudioUrl?: string;  // Pre-generated URL from Firebase Storage
    };
    onComplete: (score: number) => void;
    onGenerateAudio?: () => Promise<{ audioBase64: string; mimeType: string } | null>;
}

export function PassiveListeningView({ article, onComplete, onGenerateAudio }: PassiveListeningViewProps) {
    const [mode, setMode] = useState<'listening' | 'quiz'>('listening');
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);

    // Audio state
    const [isPlaying, setIsPlaying] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const [audioLoading, setAudioLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Load audio on mount
    useEffect(() => {
        const loadAudio = async () => {
            // Priority 1: Pre-generated URL (fastest, already in Firebase Storage)
            if (article.preGeneratedAudioUrl) {
                setAudioUrl(article.preGeneratedAudioUrl);
                return;
            }

            // Priority 2: Inline base64 audio
            if (article.audioBase64) {
                const blob = base64ToBlob(article.audioBase64, article.audioMimeType || 'audio/wav');
                setAudioUrl(URL.createObjectURL(blob));
                return;
            }

            // Generate audio
            if (onGenerateAudio) {
                setAudioLoading(true);
                try {
                    const result = await onGenerateAudio();
                    if (result) {
                        const blob = base64ToBlob(result.audioBase64, result.mimeType);
                        setAudioUrl(URL.createObjectURL(blob));
                    } else {
                        setAudioError('Failed to generate audio');
                    }
                } catch (err) {
                    setAudioError('Audio generation failed');
                    console.error('Audio generation error:', err);
                } finally {
                    setAudioLoading(false);
                }
            }
        };

        loadAudio();

        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [article.audioBase64, article.audioMimeType, onGenerateAudio]);

    // Helper to convert base64 to blob
    const base64ToBlob = (base64: string, mimeType: string): Blob => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    };

    const togglePlay = () => {
        if (!audioRef.current || !audioUrl) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const restartAudio = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    const handleNext = () => {
        if (currentQuestionIndex < article.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setSelectedOption(null);
            setIsAnswered(false);
        } else {
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

    // Listening Mode
    if (mode === 'listening') {
        return (
            <div className="space-y-6 max-w-2xl mx-auto">
                <Card className="p-8 bg-white border-slate-200 shadow-sm">
                    {/* Header */}
                    <div className="mb-6 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-indigo-500 text-sm mb-2">
                            <Headphones className="w-4 h-4" />
                            <span>Listening Practice</span>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800">
                            {article.title}
                        </h2>
                    </div>

                    {/* Audio Player */}
                    <div className="bg-slate-50 rounded-xl p-6 mb-6">
                        {audioLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                <span className="ml-3 text-slate-600">Generating audio...</span>
                            </div>
                        ) : audioError ? (
                            <div className="text-center py-8 text-red-500">
                                <p>{audioError}</p>
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => setShowTranscript(true)}
                                >
                                    Show Transcript Instead
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <audio
                                    ref={audioRef}
                                    src={audioUrl || undefined}
                                    onEnded={handleAudioEnded}
                                    className="hidden"
                                />

                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="w-12 h-12 rounded-full"
                                        onClick={restartAudio}
                                        disabled={!audioUrl}
                                    >
                                        <RotateCcw className="w-5 h-5" />
                                    </Button>

                                    <Button
                                        size="icon"
                                        className="w-16 h-16 rounded-full bg-indigo-600 hover:bg-indigo-700"
                                        onClick={togglePlay}
                                        disabled={!audioUrl}
                                    >
                                        {isPlaying ? (
                                            <Pause className="w-8 h-8" />
                                        ) : (
                                            <Play className="w-8 h-8 ml-1" />
                                        )}
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="w-12 h-12 rounded-full"
                                        onClick={() => setShowTranscript(!showTranscript)}
                                    >
                                        {showTranscript ? (
                                            <EyeOff className="w-5 h-5" />
                                        ) : (
                                            <Eye className="w-5 h-5" />
                                        )}
                                    </Button>
                                </div>

                                <p className="text-sm text-slate-500">
                                    {showTranscript ? 'Transcript visible' : 'Tap eye icon to show transcript'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Transcript (toggled) */}
                    <AnimatePresence>
                        {showTranscript && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-6"
                            >
                                <ScrollArea className="h-[40vh] pr-4">
                                    <div className="prose prose-slate prose-base text-slate-700 leading-relaxed whitespace-pre-line">
                                        {article.content}
                                    </div>
                                </ScrollArea>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Next Button */}
                    <div className="pt-6 border-t border-slate-100 flex justify-end">
                        <Button
                            onClick={() => setMode('quiz')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6"
                        >
                            Check Understanding <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // Quiz Mode (same as PassiveStoryView)
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
                                    {currentQuestionIndex < article.questions.length - 1 ? 'Next Question' : 'Finish Listening'}
                                </Button>
                            </motion.div>
                        )}
                    </Card>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
