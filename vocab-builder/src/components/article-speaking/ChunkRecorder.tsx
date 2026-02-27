'use client';

/**
 * ChunkRecorder - Recording UI for a single chunk
 * 
 * Features:
 * - Waveform visualization
 * - Timer with max duration
 * - Silence detection
 * - Retry counter
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, RotateCcw, Play, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChunkRecorderProps {
    onRecordingComplete: (audioBlob: Blob) => void;
    onReplay: () => void;
    maxDuration?: number;
}

export function ChunkRecorder({
    onRecordingComplete,
    onReplay,
    maxDuration = 60
}: ChunkRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [silenceWarning, setSilenceWarning] = useState(false);
    const [amplitude, setAmplitude] = useState<number[]>(Array(20).fill(5));

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number | null>(null);
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, [audioUrl]);

    // Start recording
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Set up audio context for visualization
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            // Set up media recorder
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4'
            });

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
                stream.getTracks().forEach(track => track.stop());
                audioContext.close();
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);
            setSilenceWarning(false);

            // Start timer
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    if (prev >= maxDuration - 1) {
                        stopRecording();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);

            // Start visualization
            visualize(analyser);

        } catch (error) {
            console.error('[ChunkRecorder] Mic access error:', error);
            alert('Unable to access microphone. Please check your permissions.');
        }
    }, [maxDuration]);

    // Visualize audio levels
    const visualize = useCallback((analyser: AnalyserNode) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silentFrames = 0;

        const update = () => {
            analyser.getByteFrequencyData(dataArray);

            // Calculate amplitude bars
            const bars = 20;
            const newAmplitude: number[] = [];
            const step = Math.floor(dataArray.length / bars);

            for (let i = 0; i < bars; i++) {
                const sum = dataArray.slice(i * step, (i + 1) * step).reduce((a, b) => a + b, 0);
                const avg = sum / step;
                newAmplitude.push(Math.max(5, avg / 3));
            }

            setAmplitude(newAmplitude);

            // Check for silence (all low values)
            const maxVal = Math.max(...dataArray);
            if (maxVal < 10) {
                silentFrames++;
                if (silentFrames > 150) { // ~2.5 seconds of silence
                    setSilenceWarning(true);
                }
            } else {
                silentFrames = 0;
                setSilenceWarning(false);
            }

            animationRef.current = requestAnimationFrame(update);
        };

        update();
    }, []);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        setAmplitude(Array(20).fill(5));
    }, []);

    // Submit recording
    const submitRecording = useCallback(() => {
        if (audioBlob) {
            onRecordingComplete(audioBlob);
        }
    }, [audioBlob, onRecordingComplete]);

    // Re-record
    const reRecord = useCallback(() => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordingTime(0);
    }, [audioUrl]);

    // Play back recording
    const playRecording = useCallback(() => {
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play();
        }
    }, [audioUrl]);

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <p className="text-slate-400 text-sm mb-4 text-center">
                Step 2: Record yourself reading the text
            </p>

            {/* Waveform visualization */}
            <div className="flex items-center justify-center gap-1 h-16 mb-4">
                {amplitude.map((height, i) => (
                    <motion.div
                        key={i}
                        className={`w-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-slate-600'}`}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.1 }}
                    />
                ))}
            </div>

            {/* Timer */}
            <div className="text-center mb-4">
                <span className={`text-2xl font-mono ${isRecording ? 'text-red-400' : 'text-white'}`}>
                    {formatTime(recordingTime)}
                </span>
                <span className="text-slate-500 text-sm ml-2">
                    / {formatTime(maxDuration)}
                </span>
            </div>

            {/* Silence warning */}
            {silenceWarning && (
                <p className="text-amber-400 text-sm text-center mb-4 flex items-center justify-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    We can't hear you - check your microphone
                </p>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
                {!audioBlob ? (
                    <>
                        {/* Replay reference */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onReplay}
                            className="text-slate-400"
                        >
                            <Volume2 className="h-4 w-4 mr-2" />
                            Replay
                        </Button>

                        {/* Record button */}
                        <Button
                            size="lg"
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`h-16 w-16 rounded-full ${isRecording
                                    ? 'bg-red-600 hover:bg-red-500 animate-pulse'
                                    : 'bg-teal-600 hover:bg-teal-500'
                                }`}
                        >
                            {isRecording ? (
                                <Square className="h-6 w-6" fill="white" />
                            ) : (
                                <Mic className="h-8 w-8" />
                            )}
                        </Button>

                        <div className="w-20" /> {/* Spacer */}
                    </>
                ) : (
                    <>
                        {/* Re-record */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={reRecord}
                            className="text-slate-400"
                        >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Re-record
                        </Button>

                        {/* Play recording */}
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={playRecording}
                            className="h-12 w-12 rounded-full"
                        >
                            <Play className="h-5 w-5" />
                        </Button>

                        {/* Submit */}
                        <Button
                            size="lg"
                            onClick={submitRecording}
                            className="bg-teal-600 hover:bg-teal-500"
                        >
                            Submit Recording
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
