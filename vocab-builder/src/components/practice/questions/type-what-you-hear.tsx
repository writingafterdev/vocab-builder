'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Volume2, Send, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { TypeWhatYouHearContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: TypeWhatYouHearContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

function fuzzyMatch(input: string, acceptable: string[]): boolean {
    if (!acceptable || acceptable.length === 0) return true;

    const normalized = input.toLowerCase().trim();
    return acceptable.some(answer => {
        const target = answer.toLowerCase().trim();
        if (normalized === target) return true;
        const distance = levenshteinDistance(normalized, target);
        return distance <= 2;
    });
}

function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export default function TypeWhatYouHearQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [input, setInput] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [startTime] = useState(Date.now());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    const playAudio = async () => {
        if (audioUrlRef.current && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
            setIsPlaying(true);
            return;
        }

        if (content.audioUrl) {
            if (!audioRef.current) {
                audioRef.current = new Audio(content.audioUrl);
                audioRef.current.onended = () => setIsPlaying(false);
            }
            audioRef.current.play();
            setIsPlaying(true);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content.audioText }),
            });

            if (!response.ok) throw new Error('TTS failed');

            const blob = await response.blob();
            audioUrlRef.current = URL.createObjectURL(blob);
            audioRef.current = new Audio(audioUrlRef.current);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.play();
            setIsPlaying(true);
        } catch (error) {
            console.error('TTS error:', error);
            const utterance = new SpeechSynthesisUtterance(content.audioText);
            utterance.rate = 0.85;
            utterance.onend = () => setIsPlaying(false);
            window.speechSynthesis.speak(utterance);
            setIsPlaying(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = () => {
        if (disabled || submitted || !input.trim()) return;

        const correct = fuzzyMatch(input, content.acceptableAnswers);
        setIsCorrect(correct);
        setSubmitted(true);

        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(input, correct, timeTaken);
        }, 500);
    };

    useEffect(() => {
        return () => {
            if (audioRef.current) audioRef.current.pause();
            if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
            window.speechSynthesis.cancel();
        };
    }, []);

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Type what you hear
                </h1>
                {content.hint && (
                    <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                        Hint: {content.hint}
                    </p>
                )}
            </div>

            {/* Audio Player Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-8 mb-10 flex flex-col items-center"
            >
                <button
                    onClick={playAudio}
                    disabled={isPlaying}
                    className={cn(
                        "w-16 h-16 flex items-center justify-center transition-all mb-3",
                        isPlaying
                            ? "bg-neutral-900 text-white"
                            : "bg-white text-neutral-900 border border-neutral-200 hover:border-neutral-400"
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                        <Volume2 className="w-6 h-6" />
                    )}
                </button>
                <p className="text-xs text-neutral-400">
                    {isPlaying ? 'Listening...' : 'Tap to play'}
                </p>
            </motion.div>

            {/* Input */}
            <div className="flex-1 flex flex-col justify-start">
                <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium mb-3">
                    Your Answer
                </p>
                <div className={cn(
                    'border transition-all p-3',
                    submitted
                        ? isCorrect
                            ? 'border-neutral-900 bg-neutral-50'
                            : 'border-neutral-300 bg-neutral-50'
                        : 'border-neutral-200 focus-within:border-neutral-900'
                )}>
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        placeholder="Type what you heard..."
                        disabled={disabled || submitted}
                        className="bg-transparent border-none text-base text-neutral-800 placeholder:text-neutral-300 focus-visible:ring-0"
                    />
                </div>

                {submitted && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex items-center gap-2"
                    >
                        {isCorrect ? (
                            <Check className="w-4 h-4 text-neutral-900" />
                        ) : (
                            <X className="w-4 h-4 text-neutral-400" />
                        )}
                        <span className={cn(
                            "text-sm",
                            isCorrect ? 'text-neutral-900' : 'text-neutral-500'
                        )}>
                            {isCorrect ? 'Correct' : `Answer: ${content.acceptableAnswers[0]}`}
                        </span>
                    </motion.div>
                )}

                {!submitted && (
                    <button
                        onClick={handleSubmit}
                        disabled={!input.trim() || disabled}
                        className={cn(
                            "mt-4 py-3 text-sm font-semibold uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-2",
                            !input.trim() || disabled
                                ? "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                                : "bg-neutral-900 text-white hover:bg-neutral-800"
                        )}
                    >
                        Check
                        <Send className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
