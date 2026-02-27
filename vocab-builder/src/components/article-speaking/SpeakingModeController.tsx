'use client';

/**
 * SpeakingModeController - Main orchestrator for Read & Speak mode
 * 
 * NOW USES:
 * - Server-side chunk generation (consistent across users)
 * - Shared TTS cache (first user generates, all users reuse)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipForward, Mic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChunkRecorder } from './ChunkRecorder';
import { ChunkFeedback } from './ChunkFeedback';
import { SpeakingSummarySheet } from './SpeakingSummarySheet';
import type { SpeakingAnalysisResult } from '@/lib/speaking-feedback';
import type { SpeakingChunk } from '@/types';

interface ChunkResult {
    chunkIndex: number;
    chunk: string;
    feedback: SpeakingAnalysisResult | null;
    attempts: number;
    status: 'pending' | 'recording' | 'analyzing' | 'complete' | 'skipped';
    audioUrl?: string;
}

interface SpeakingModeControllerProps {
    articleId: string;
    articleContent: string;
    onClose: () => void;
    userId: string;
}

export function SpeakingModeController({
    articleId,
    articleContent,
    onClose,
    userId
}: SpeakingModeControllerProps) {
    // Chunk state - fetched from API
    const [chunks, setChunks] = useState<SpeakingChunk[]>([]);
    const [results, setResults] = useState<ChunkResult[]>([]);
    const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
    const [isLoadingChunks, setIsLoadingChunks] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // UI state
    const [phase, setPhase] = useState<'listen' | 'record' | 'feedback'>('listen');
    const [playbackSpeed, setPlaybackSpeed] = useState<0.75 | 1 | 1.25>(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);

    // Audio refs
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    const currentChunk = chunks[currentChunkIndex]?.text || '';
    const currentAudioUrl = results[currentChunkIndex]?.audioUrl;
    const currentResult = results[currentChunkIndex];
    const totalChunks = chunks.length;
    const completedChunks = results.filter(r => r.status === 'complete' || r.status === 'skipped').length;

    // Estimated time remaining
    const avgTimePerChunk = 30;
    const remainingChunks = totalChunks - completedChunks;
    const estimatedMinutes = Math.ceil((remainingChunks * avgTimePerChunk) / 60);

    // Fetch chunks from API on mount
    useEffect(() => {
        async function fetchChunks() {
            setIsLoadingChunks(true);
            setLoadError(null);

            try {
                const response = await fetch(`/api/article/speaking-chunks?articleId=${articleId}`, {
                    headers: { 'x-user-id': userId }
                });

                if (!response.ok) {
                    throw new Error('Failed to load speaking chunks');
                }

                const data = await response.json();
                const serverChunks: SpeakingChunk[] = data.chunks || [];

                setChunks(serverChunks);
                setResults(serverChunks.map((chunk, i) => ({
                    chunkIndex: i,
                    chunk: chunk.text,
                    feedback: null,
                    attempts: 0,
                    status: 'pending' as const,
                    audioUrl: chunk.audioUrl
                })));

                console.log(`[Speaking Mode] Loaded ${serverChunks.length} chunks, ${data.cached ? 'cached' : 'new'}`);
            } catch (error) {
                console.error('[Speaking Mode] Error loading chunks:', error);
                setLoadError('Failed to load speaking mode. Please try again.');
            } finally {
                setIsLoadingChunks(false);
            }
        }

        fetchChunks();
    }, [articleId, userId]);

    // Load TTS for current chunk
    useEffect(() => {
        async function loadTTS() {
            if (!currentChunk || isLoadingChunks) return;

            // Check if we already have cached audio URL
            if (currentAudioUrl) {
                console.log(`[Speaking Mode] Using cached audio for chunk ${currentChunkIndex}`);
                audioUrlRef.current = currentAudioUrl;
                return;
            }

            // Generate TTS via API (will be cached for future users)
            setIsLoadingAudio(true);
            try {
                const response = await fetch('/api/article/speaking-chunks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId
                    },
                    body: JSON.stringify({
                        articleId,
                        chunkIndex: currentChunkIndex
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    audioUrlRef.current = data.audioUrl;

                    // Update results with cached URL
                    setResults(prev => prev.map((r, i) =>
                        i === currentChunkIndex ? { ...r, audioUrl: data.audioUrl } : r
                    ));

                    console.log(`[Speaking Mode] TTS ${data.cached ? 'cached' : 'generated'} for chunk ${currentChunkIndex}`);
                } else {
                    console.error('[Speaking Mode] Failed to get TTS');
                }
            } catch (error) {
                console.error('[Speaking Mode] TTS error:', error);
            } finally {
                setIsLoadingAudio(false);
            }
        }

        loadTTS();
    }, [currentChunkIndex, currentChunk, currentAudioUrl, isLoadingChunks, articleId, userId]);

    // Play/pause TTS
    const togglePlayback = useCallback(() => {
        if (!audioUrlRef.current) {
            console.log('[Speaking Mode] TTS audio not loaded yet');
            return;
        }

        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            if (!audioRef.current) {
                audioRef.current = document.querySelector('audio') as HTMLAudioElement;
            }
            if (audioRef.current) {
                audioRef.current.src = audioUrlRef.current;
                audioRef.current.playbackRate = playbackSpeed;
                audioRef.current.play().catch(err => {
                    console.error('[Speaking Mode] Playback error:', err);
                });
                setIsPlaying(true);
            }
        }
    }, [isPlaying, playbackSpeed]);

    // Handle recording complete
    const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
        setPhase('feedback');

        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl.split(',')[1]);
            };
            reader.readAsDataURL(audioBlob);
        });

        setResults(prev => prev.map((r, i) =>
            i === currentChunkIndex ? { ...r, status: 'analyzing', attempts: r.attempts + 1 } : r
        ));

        try {
            const response = await fetch('/api/article/chunk-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify({
                    chunk: currentChunk,
                    audioBase64: base64,
                    mimeType: audioBlob.type,
                    articleId,
                    chunkIndex: currentChunkIndex
                })
            });

            if (response.ok) {
                const data = await response.json();
                setResults(prev => prev.map((r, i) =>
                    i === currentChunkIndex
                        ? { ...r, feedback: data.feedback, status: 'complete' }
                        : r
                ));
            } else {
                setResults(prev => prev.map((r, i) =>
                    i === currentChunkIndex ? { ...r, status: 'complete' } : r
                ));
            }
        } catch (error) {
            console.error('[Speaking Mode] Analysis error:', error);
            setResults(prev => prev.map((r, i) =>
                i === currentChunkIndex ? { ...r, status: 'complete' } : r
            ));
        }
    }, [currentChunkIndex, currentChunk, articleId, userId]);

    // Navigation
    const goToNextChunk = useCallback(() => {
        if (currentChunkIndex < totalChunks - 1) {
            setCurrentChunkIndex(prev => prev + 1);
            setPhase('listen');
            audioUrlRef.current = null; // Reset for new chunk
        } else {
            setShowSummary(true);
        }
    }, [currentChunkIndex, totalChunks]);

    const retryChunk = useCallback(() => {
        if (currentResult?.attempts < 3) {
            setPhase('record');
        }
    }, [currentResult]);

    const skipChunk = useCallback(() => {
        setResults(prev => prev.map((r, i) =>
            i === currentChunkIndex ? { ...r, status: 'skipped' } : r
        ));
        goToNextChunk();
    }, [currentChunkIndex, goToNextChunk]);

    const cycleSpeed = () => {
        setPlaybackSpeed(prev => prev === 0.75 ? 1 : prev === 1 ? 1.25 : 0.75);
    };

    // Loading state
    if (isLoadingChunks) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 text-teal-400 animate-spin mb-4" />
                <p className="text-slate-300">Loading speaking mode...</p>
            </div>
        );
    }

    // Error state
    if (loadError) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center gap-4">
                <p className="text-red-400">{loadError}</p>
                <Button onClick={onClose} variant="outline">Close</Button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col">
            {/* Hidden audio element */}
            <audio
                ref={audioRef}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
            />

            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-white">
                        <Mic className="h-5 w-5 text-teal-400" />
                        <span className="font-semibold">Read & Speak</span>
                    </div>
                    <span className="text-slate-400 text-sm">
                        Chunk {currentChunkIndex + 1} of {totalChunks} • ~{estimatedMinutes} min remaining
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSummary(true)}
                        className="text-slate-300 hover:text-white"
                    >
                        View Progress
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
                <div className="max-w-3xl w-full space-y-8">

                    {/* Current chunk text */}
                    <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
                        <p className="text-xl text-white leading-relaxed font-serif">
                            "{currentChunk}"
                        </p>
                    </div>

                    {/* Phase-specific UI */}
                    <AnimatePresence mode="wait">
                        {phase === 'listen' && (
                            <motion.div
                                key="listen"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="bg-slate-800/50 rounded-xl p-6 border border-slate-700"
                            >
                                <p className="text-slate-400 text-sm mb-4 text-center">
                                    Step 1: Listen to the reference audio
                                </p>

                                {/* Playback controls */}
                                <div className="flex items-center justify-center gap-4 mb-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={cycleSpeed}
                                        className="text-slate-300"
                                    >
                                        {playbackSpeed}x
                                    </Button>
                                    <Button
                                        size="lg"
                                        onClick={togglePlayback}
                                        disabled={isLoadingAudio}
                                        className="h-16 w-16 rounded-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
                                    >
                                        {isLoadingAudio ? (
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                        ) : isPlaying ? (
                                            <Pause className="h-8 w-8" />
                                        ) : (
                                            <Play className="h-8 w-8 ml-1" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPhase('record')}
                                        className="text-teal-400"
                                    >
                                        Ready to record →
                                    </Button>
                                </div>

                                {isLoadingAudio && (
                                    <p className="text-slate-500 text-xs text-center">
                                        Generating audio (will be cached for faster loading next time)...
                                    </p>
                                )}
                            </motion.div>
                        )}

                        {phase === 'record' && (
                            <motion.div
                                key="record"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                <ChunkRecorder
                                    onRecordingComplete={handleRecordingComplete}
                                    onReplay={togglePlayback}
                                    maxDuration={60}
                                />
                            </motion.div>
                        )}

                        {phase === 'feedback' && currentResult?.feedback && (
                            <motion.div
                                key="feedback"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                <ChunkFeedback
                                    feedback={currentResult.feedback}
                                    canRetry={currentResult.attempts < 3}
                                    onRetry={retryChunk}
                                    onNext={goToNextChunk}
                                    isLastChunk={currentChunkIndex === totalChunks - 1}
                                />
                            </motion.div>
                        )}

                        {phase === 'feedback' && currentResult?.status === 'analyzing' && (
                            <motion.div
                                key="analyzing"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-8"
                            >
                                <div className="animate-spin h-8 w-8 border-2 border-teal-400 border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-slate-400">Analyzing your pronunciation...</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Bottom actions */}
                    <div className="flex justify-between items-center">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={skipChunk}
                            className="text-slate-400 hover:text-white"
                        >
                            <SkipForward className="h-4 w-4 mr-2" />
                            Skip this chunk
                        </Button>

                        {currentResult?.attempts > 0 && currentResult.attempts < 3 && (
                            <span className="text-slate-500 text-sm">
                                Retries: {3 - currentResult.attempts} remaining
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary modal */}
            <AnimatePresence>
                {showSummary && (
                    <SpeakingSummarySheet
                        results={results}
                        articleId={articleId}
                        userId={userId}
                        onClose={() => setShowSummary(false)}
                        onFinish={onClose}
                        isComplete={completedChunks === totalChunks}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
