'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Volume2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ConversationMessage } from '@/lib/db/types';

interface ListeningModeProps {
    messages: ConversationMessage[];
    onComplete?: () => void;
}

export function ListeningMode({ messages, onComplete }: ListeningModeProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [audioSegments, setAudioSegments] = useState<{ id: string; audio: string }[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Generate audio on mount using Edge TTS
    useEffect(() => {
        generateAudio();
    }, []);

    const generateAudio = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages
                        .filter(m => m.text.trim() && m.speakerId !== 'user')
                        .map(m => ({
                            id: m.id,
                            speakerName: m.speakerName,
                            text: m.text,
                        })),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setAudioSegments(data.segments.map((s: { id: string; base64: string }) => ({
                    id: s.id,
                    audio: `data:audio/mpeg;base64,${s.base64}`,
                })));
            }
        } catch (error) {
            console.error('TTS error:', error);
        } finally {
            setLoading(false);
        }
    };

    const playFromIndex = useCallback((index: number) => {
        if (index >= audioSegments.length) {
            setIsPlaying(false);
            setCurrentMessageIndex(-1);
            onComplete?.();
            return;
        }

        const segment = audioSegments[index];
        const audio = new Audio(segment.audio);
        audioRef.current = audio;

        audio.onended = () => {
            // Small pause between messages
            setTimeout(() => playFromIndex(index + 1), 400);
        };

        audio.onerror = () => {
            playFromIndex(index + 1);
        };

        audio.play();
        setCurrentMessageIndex(index);
        setIsPlaying(true);
    }, [audioSegments, onComplete]);

    const handlePlay = () => {
        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        } else {
            playFromIndex(currentMessageIndex < 0 ? 0 : currentMessageIndex);
        }
    };

    const handleRestart = () => {
        audioRef.current?.pause();
        setCurrentMessageIndex(-1);
        setIsPlaying(false);
    };

    const playableMessages = messages.filter(m => m.text.trim() && m.speakerId !== 'user');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">Listening Mode</h3>
                        <p className="text-sm text-slate-500">Focus on the conversation flow</p>
                    </div>
                </div>
            </div>

            {/* Conversation with focus effect */}
            <div className="space-y-3 max-h-[50vh] overflow-auto p-4 bg-slate-50 rounded-xl">
                {playableMessages.map((message, idx) => {
                    const isCurrent = idx === currentMessageIndex;
                    const isPast = idx < currentMessageIndex;
                    const isFuture = idx > currentMessageIndex || currentMessageIndex < 0;

                    return (
                        <motion.div
                            key={`${idx}-${message.id}`}
                            animate={{
                                opacity: isCurrent ? 1 : isPast ? 0.4 : 0.25,
                                scale: isCurrent ? 1.02 : 1,
                            }}
                            transition={{ duration: 0.3 }}
                            className={cn(
                                "p-4 rounded-xl transition-all border",
                                isCurrent && "bg-white ring-2 ring-blue-400 shadow-lg border-blue-200",
                                isPast && "bg-white/50 border-transparent",
                                isFuture && "bg-white/30 border-transparent"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div className={cn(
                                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                                    isCurrent ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-500"
                                )}>
                                    {message.speakerName[0].toUpperCase()}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <span className={cn(
                                        "text-xs font-medium",
                                        isCurrent ? "text-blue-600" : "text-slate-400"
                                    )}>
                                        {message.speakerName}
                                    </span>
                                    <p className={cn(
                                        "mt-1 leading-relaxed",
                                        isCurrent ? "text-slate-900" : "text-slate-600"
                                    )}>
                                        {message.text}
                                    </p>
                                </div>

                                {/* Speaking indicator */}
                                {isCurrent && (
                                    <motion.div
                                        animate={{ opacity: [1, 0.5, 1] }}
                                        transition={{ repeat: Infinity, duration: 1.5 }}
                                        className="flex gap-0.5"
                                    >
                                        {[1, 2, 3].map(i => (
                                            <motion.div
                                                key={i}
                                                animate={{ height: ['8px', '16px', '8px'] }}
                                                transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                                                className="w-1 bg-blue-500 rounded-full"
                                            />
                                        ))}
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRestart}
                    disabled={loading}
                    className="rounded-full"
                >
                    <RotateCcw className="w-4 h-4" />
                </Button>

                <Button
                    size="lg"
                    onClick={handlePlay}
                    disabled={loading || audioSegments.length === 0}
                    className="gap-2 px-10 rounded-full"
                >
                    {loading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
                    ) : isPlaying ? (
                        <><Pause className="w-5 h-5" /> Pause</>
                    ) : (
                        <><Play className="w-5 h-5" /> {currentMessageIndex < 0 ? 'Listen' : 'Continue'}</>
                    )}
                </Button>

                <div className="text-sm text-slate-500 min-w-[60px] text-center">
                    {currentMessageIndex >= 0 ? currentMessageIndex + 1 : 0} / {playableMessages.length}
                </div>
            </div>
        </div>
    );
}
