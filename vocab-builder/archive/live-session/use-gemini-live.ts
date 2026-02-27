'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';

interface UseGeminiLiveOptions {
    userId: string;
    authToken: string;
    systemPrompt: string;
    onTranscriptUpdate?: (transcript: string) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

interface UseGeminiLiveReturn {
    isConnected: boolean;
    isRecording: boolean;
    isSpeaking: boolean;
    transcript: string;
    userTranscript: string;
    aiTranscript: string;
    error: string | null;
    startSession: () => Promise<void>;
    stopSession: () => void;
    duration: number;
}

/**
 * Hook for handling Gemini Live Audio streaming
 * 
 * Uses ephemeral tokens for secure browser-to-Gemini connection.
 * The token is fetched from our backend, then used to connect directly
 * to Gemini Live API from the browser.
 */
export function useGeminiLive(options: UseGeminiLiveOptions): UseGeminiLiveReturn {
    const { userId, authToken, systemPrompt, onTranscriptUpdate, onError, onComplete } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [userTranscript, setUserTranscript] = useState('');
    const [aiTranscript, setAiTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);

    const sessionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const isPlayingRef = useRef(false);

    // Duration timer
    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isRecording]);

    /**
     * Play audio data from Gemini response
     */
    const playAudioChunk = useCallback(async (base64Audio: string) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            }

            const audioCtx = audioContextRef.current;

            // Decode base64 to ArrayBuffer
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Queue the audio
            audioQueueRef.current.push(bytes.buffer);

            // Start playback if not already playing
            if (!isPlayingRef.current) {
                playNextInQueue();
            }
        } catch (e) {
            console.error('Error playing audio:', e);
        }
    }, []);

    const playNextInQueue = async () => {
        if (audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            setIsSpeaking(false);
            return;
        }

        isPlayingRef.current = true;
        setIsSpeaking(true);

        const audioCtx = audioContextRef.current;
        if (!audioCtx) return;

        const chunk = audioQueueRef.current.shift()!;

        try {
            // Create PCM buffer (16-bit mono at 24kHz)
            const int16Array = new Int16Array(chunk);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768;
            }

            const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);

            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.onended = () => playNextInQueue();
            source.start(0);
        } catch (e) {
            console.error('Error decoding audio:', e);
            playNextInQueue();
        }
    };

    const startSession = useCallback(async () => {
        try {
            console.log('[useGeminiLive] Starting session...');
            setError(null);
            setTranscript('');
            setUserTranscript('');
            setAiTranscript('');
            setDuration(0);
            audioQueueRef.current = [];

            // Get ephemeral token from our backend
            console.log('[useGeminiLive] Fetching ephemeral token for user:', userId);
            const tokenRes = await fetch('/api/live-session/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'x-user-id': userId
                },
                body: JSON.stringify({ systemInstruction: systemPrompt })
            });

            console.log('[useGeminiLive] Token response status:', tokenRes.status);

            if (!tokenRes.ok) {
                const errorText = await tokenRes.text();
                console.error('[useGeminiLive] Token fetch failed:', errorText);
                throw new Error('Failed to get session token: ' + errorText);
            }

            const tokenData = await tokenRes.json();
            console.log('[useGeminiLive] Token received:', tokenData.token?.substring(0, 20) + '...');
            console.log('[useGeminiLive] Token expires at:', tokenData.expiresAt);

            // Initialize Gemini with ephemeral token
            // NOTE: Ephemeral tokens require v1alpha API version
            console.log('[useGeminiLive] Initializing GoogleGenAI with token (v1alpha)...');
            const ai = new GoogleGenAI({
                apiKey: tokenData.token,
                httpOptions: { apiVersion: 'v1alpha' }
            });

            // Request microphone access
            console.log('[useGeminiLive] Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });
            console.log('[useGeminiLive] Microphone access granted');
            mediaStreamRef.current = stream;

            // Create audio context for capturing
            console.log('[useGeminiLive] Creating audio context...');
            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            const source = audioContextRef.current.createMediaStreamSource(stream);

            // Create processor for capturing audio data
            processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            // Connect to Gemini Live API
            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: systemPrompt,
                },
                callbacks: {
                    onopen: () => {
                        console.log('Connected to Gemini Live API');
                        setIsConnected(true);
                        setIsRecording(true);
                    },
                    onmessage: (message: any) => {
                        // Handle interruption
                        if (message.serverContent?.interrupted) {
                            audioQueueRef.current = [];
                            return;
                        }

                        // Handle model response
                        if (message.serverContent?.modelTurn?.parts) {
                            for (const part of message.serverContent.modelTurn.parts) {
                                // Audio response
                                if (part.inlineData?.data) {
                                    playAudioChunk(part.inlineData.data);
                                }
                                // Text transcript (if available)
                                if (part.text) {
                                    setAiTranscript(prev => prev + ' ' + part.text);
                                    setTranscript(prev => prev + '\nAI: ' + part.text);
                                }
                            }
                        }

                        // Handle user transcript (if speech recognition is enabled)
                        if (message.serverContent?.turnComplete) {
                            // Turn is complete
                        }
                    },
                    onerror: (e: any) => {
                        console.error('Gemini Live error:', e);
                        setError(e.message || 'Connection error');
                        onError?.(new Error(e.message));
                    },
                    onclose: (e: any) => {
                        console.log('Gemini Live closed:', e?.reason);
                        setIsConnected(false);
                        setIsRecording(false);
                        onComplete?.();
                    },
                },
            });

            sessionRef.current = session;

            // Process audio and send to Gemini
            processorRef.current.onaudioprocess = (e) => {
                if (sessionRef.current) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    // Convert Float32Array to Int16Array
                    const int16Data = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const sample = Math.max(-1, Math.min(1, inputData[i]));
                        int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    }

                    // Convert to base64
                    const base64 = btoa(
                        String.fromCharCode(...new Uint8Array(int16Data.buffer))
                    );

                    // Send to Gemini
                    sessionRef.current.sendRealtimeInput({
                        audio: {
                            data: base64,
                            mimeType: 'audio/pcm;rate=16000'
                        }
                    });
                }
            };

            source.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to start session';
            setError(errorMessage);
            onError?.(err instanceof Error ? err : new Error(errorMessage));
        }
    }, [systemPrompt, onError, onComplete, playAudioChunk]);

    const stopSession = useCallback(() => {
        // Close Gemini session
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }

        // Stop audio processing
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setIsConnected(false);
        setIsRecording(false);
        setIsSpeaking(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSession();
        };
    }, [stopSession]);

    return {
        isConnected,
        isRecording,
        isSpeaking,
        transcript,
        userTranscript,
        aiTranscript,
        error,
        startSession,
        stopSession,
        duration
    };
}
