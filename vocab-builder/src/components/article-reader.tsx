'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, Loader2, VolumeX, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpeakingModeController } from '@/components/article-speaking';

interface ArticleReaderProps {
    content: string;
    className?: string;
    articleId?: string;
    userId?: string;
}

/**
 * TTS Article Reader component
 * Provides audio playback for article content
 */
export function ArticleReader({ content, className, articleId, userId }: ArticleReaderProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [showSpeakingMode, setShowSpeakingMode] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    // Clean text for TTS (remove HTML, extra spaces)
    const cleanTextForTTS = useCallback((html: string): string => {
        return html
            .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')       // Normalize whitespace
            .trim();
    }, []);

    // Generate TTS audio
    const generateAudio = useCallback(async () => {
        const text = cleanTextForTTS(content);
        if (!text) return null;

        // Limit to ~5000 chars for reasonable audio length
        const truncatedText = text.slice(0, 5000);

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: truncatedText,
                    voice: 'female_professional', // Clear, professional voice for articles
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate audio');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            return url;
        } catch (err) {
            setError('Failed to load audio');
            console.error('TTS error:', err);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [content, cleanTextForTTS]);

    // Handle play/pause
    const togglePlayback = useCallback(async () => {
        if (isLoading) return;

        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        // Generate audio if not already loaded
        if (!audioUrlRef.current) {
            const url = await generateAudio();
            if (!url) return;
            audioUrlRef.current = url;
        }

        // Play audio
        if (!audioRef.current) {
            audioRef.current = new Audio(audioUrlRef.current);

            audioRef.current.onloadedmetadata = () => {
                setDuration(audioRef.current?.duration || 0);
            };

            audioRef.current.ontimeupdate = () => {
                const audio = audioRef.current;
                if (audio) {
                    setCurrentTime(audio.currentTime);
                    setProgress((audio.currentTime / audio.duration) * 100);
                }
            };

            audioRef.current.onended = () => {
                setIsPlaying(false);
                setProgress(100);
            };

            audioRef.current.onerror = () => {
                setError('Audio playback failed');
                setIsPlaying(false);
            };
        }

        try {
            await audioRef.current.play();
            setIsPlaying(true);
        } catch (err) {
            console.error('Playback error:', err);
            setError('Failed to play audio');
        }
    }, [isPlaying, isLoading, generateAudio]);

    // Handle restart
    const restart = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setProgress(0);
            setCurrentTime(0);
            if (!isPlaying) {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    }, [isPlaying]);

    // Handle seek
    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioRef.current || !duration) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * duration;

        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        setProgress(percent * 100);
    }, [duration]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }
        };
    }, []);

    // Format time
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Estimate reading time
    const wordCount = cleanTextForTTS(content).split(/\s+/).length;
    const estimatedMinutes = Math.ceil(wordCount / 150); // ~150 words/min for TTS

    return (
        <div className={cn(
            "bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100",
            className
        )}>
            <div className="flex items-center gap-4">
                {/* Play/Pause Button */}
                <button
                    onClick={togglePlayback}
                    disabled={isLoading}
                    className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                        "bg-blue-600 hover:bg-blue-700 text-white shadow-lg",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isPlaying ? (
                        <Pause className="w-5 h-5" />
                    ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                    )}
                </button>

                {/* Progress Section */}
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <Volume2 className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-slate-700">
                                Listen to Article
                            </span>
                        </div>
                        <span className="text-xs text-slate-500">
                            {duration > 0
                                ? `${formatTime(currentTime)} / ${formatTime(duration)}`
                                : `~${estimatedMinutes} min`
                            }
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                        className="h-2 bg-blue-100 rounded-full cursor-pointer overflow-hidden"
                        onClick={handleSeek}
                    >
                        <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-150"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Restart Button */}
                {progress > 0 && (
                    <button
                        onClick={restart}
                        className="p-2 rounded-full hover:bg-blue-100 text-blue-600 transition-colors"
                        title="Restart"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )}

                {/* Speak Mode Toggle */}
                {articleId && userId && (
                    <button
                        onClick={() => setShowSpeakingMode(true)}
                        className="p-2 rounded-full hover:bg-teal-100 text-teal-600 transition-colors ml-2"
                        title="Read & Speak Mode"
                    >
                        <Mic className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Error message */}
            {error && (
                <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
                    <VolumeX className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* Speaking Mode Overlay */}
            {showSpeakingMode && articleId && userId && (
                <SpeakingModeController
                    articleId={articleId}
                    articleContent={cleanTextForTTS(content)}
                    userId={userId}
                    onClose={() => setShowSpeakingMode(false)}
                />
            )}
        </div>
    );
}
