'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ListenSelectContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: ListenSelectContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function ListenSelectQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasPlayed, setHasPlayed] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [startTime] = useState(Date.now());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    const fallbackToSpeechSynthesis = (text: string) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.onend = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
        setHasPlayed(true);
    };

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
            setHasPlayed(true);
            return;
        }

        setIsLoading(true);
        const textToSpeak = content.audioText || content.options?.[content.correctIndex] || '';

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToSpeak }),
            });

            if (!response.ok) throw new Error('TTS failed');

            const contentType = response.headers.get('content-type') || 'audio/mpeg';
            const arrayBuffer = await response.arrayBuffer();
            const audioBlob = new Blob([arrayBuffer], { type: contentType });

            audioUrlRef.current = URL.createObjectURL(audioBlob);
            audioRef.current = new Audio(audioUrlRef.current);
            audioRef.current.onended = () => setIsPlaying(false);
            audioRef.current.onerror = () => fallbackToSpeechSynthesis(textToSpeak);

            await audioRef.current.play();
            setIsPlaying(true);
            setHasPlayed(true);

        } catch (error) {
            console.error('TTS error:', error);
            fallbackToSpeechSynthesis(textToSpeak);
        } finally {
            setIsLoading(false);
        }
    };

    const pauseAudio = () => {
        if (audioRef.current) audioRef.current.pause();
        else window.speechSynthesis.cancel();
        setIsPlaying(false);
    };

    const options = content.options || (content as any).choices || [];
    const rawIndex = content.correctIndex ?? 0;
    const correctIndex = Math.max(0, Math.min(rawIndex, (content.options?.length ?? 1) - 1));

    const handleSelect = (index: number) => {
        if (disabled || selectedIndex !== null || !hasPlayed) return;

        setSelectedIndex(index);
        const correct = index === correctIndex;
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(options[index] || '', correct, timeTaken);
        }, 300);
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
                    Listen and select
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Play the audio, then choose
                </p>
            </div>

            {/* Audio Player Card */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-8 mb-10 flex flex-col items-center justify-center min-h-[160px]"
            >
                <button
                    onClick={isPlaying ? pauseAudio : playAudio}
                    className={cn(
                        "w-16 h-16 flex items-center justify-center transition-all mb-4",
                        isPlaying
                            ? "bg-neutral-900 text-white"
                            : "bg-white text-neutral-900 border border-neutral-200 hover:border-neutral-400"
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : isPlaying ? (
                        <Pause className="w-6 h-6 fill-current" />
                    ) : (
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                </button>

                <p className="text-xs text-neutral-400">
                    {isPlaying ? 'Playing...' : hasPlayed ? 'Play again' : 'Tap to listen'}
                </p>

                {/* Minimal visualizer */}
                <div className="flex items-center justify-center gap-1 h-4 mt-3">
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={isPlaying ? { height: [4, 16, 4] } : { height: 4 }}
                            transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                            className={cn(
                                "w-[2px]",
                                isPlaying ? "bg-neutral-900" : "bg-neutral-200"
                            )}
                        />
                    ))}
                </div>
            </motion.div>

            {/* Options — 2-column grid */}
            <div className={cn(
                "grid grid-cols-2 gap-3 mt-auto transition-opacity duration-500",
                hasPlayed ? 'opacity-100' : 'opacity-30 pointer-events-none'
            )}>
                {options.map((option: string, i: number) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        onClick={() => handleSelect(i)}
                        disabled={disabled || selectedIndex !== null || !hasPlayed}
                        className={cn(
                            'w-full p-4 border text-left transition-all duration-200 flex items-center justify-between',
                            selectedIndex === i
                                ? i === correctIndex
                                    ? 'border-neutral-900 bg-neutral-900 text-white'
                                    : 'border-neutral-900 bg-neutral-100'
                                : selectedIndex === null
                                    ? 'border-neutral-200 hover:border-neutral-400 bg-white'
                                    : i === correctIndex
                                        ? 'border-neutral-900 bg-neutral-50'
                                        : 'border-neutral-100 opacity-40'
                        )}
                    >
                        <span className={cn(
                            'text-sm font-medium pr-3',
                            selectedIndex === i && i === correctIndex ? 'text-white' : 'text-neutral-700'
                        )}>
                            {option}
                        </span>

                        {selectedIndex === i && i === correctIndex && (
                            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-neutral-900" />
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
