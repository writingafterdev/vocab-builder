'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Microphone,
    MicrophoneSlash,
    ArrowLeft,
    CheckCircle,
    XCircle,
    Clock,
    SpinnerGap,
    SpeakerHigh
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth-context';
import { useGeminiLive } from '@/hooks/use-gemini-live';

type SessionState = 'loading' | 'prep' | 'countdown' | 'active' | 'processing' | 'results';

interface PhraseResult {
    phraseId: string;
    phrase: string;
    used: boolean;
    context?: string;
}

interface SessionResults {
    results: PhraseResult[];
    score: number;
    passedCount: number;
    totalCount: number;
    feedback: string;
    durationSeconds: number;
}

interface SessionData {
    sessionId: string;
    systemPrompt: string;
    phrases: { id: string; phrase: string; meaning: string; topic?: string }[];
    instructions: string;
}

export default function LiveSessionPage() {
    const router = useRouter();
    const { user } = useAuth();

    const [state, setState] = useState<SessionState>('loading');
    const [countdown, setCountdown] = useState(3);
    const [sessionData, setSessionData] = useState<SessionData | null>(null);
    const [results, setResults] = useState<SessionResults | null>(null);
    const [eligiblePhrases, setEligiblePhrases] = useState<any[]>([]);
    const [authToken, setAuthToken] = useState<string>('');

    // Initialize Gemini Live hook
    const {
        isConnected,
        isRecording,
        isSpeaking,
        transcript,
        userTranscript,
        error: liveError,
        startSession: startLive,
        stopSession: stopLive,
        duration
    } = useGeminiLive({
        userId: user?.uid || '',
        authToken: authToken,
        systemPrompt: sessionData?.systemPrompt || '',
        onComplete: () => handleSessionEnd()
    });

    // Check eligibility and load phrases on mount
    useEffect(() => {
        if (!user) return;

        const checkEligibility = async () => {
            try {
                const token = await user.getIdToken();
                setAuthToken(token); // Store for hook use

                const res = await fetch('/api/live-session/eligible', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.uid
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (!data.eligible) {
                        // Not eligible, redirect back
                        router.push('/practice');
                        return;
                    }
                    setEligiblePhrases(data.phrases);
                    setState('prep');
                } else {
                    router.push('/practice');
                }
            } catch (error) {
                console.error('Error checking eligibility:', error);
                router.push('/practice');
            }
        };

        checkEligibility();
    }, [user, router]);

    // Start the session (after countdown)
    const initializeSession = useCallback(async () => {
        if (!user || eligiblePhrases.length === 0) return;

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/live-session/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    phraseIds: eligiblePhrases.map((p: any) => p.id),
                    scenario: 'casual_catchup'
                })
            });

            if (res.ok) {
                const data = await res.json();
                setSessionData(data);
                return data;
            }
        } catch (error) {
            console.error('Error starting session:', error);
        }
        return null;
    }, [user, eligiblePhrases]);

    // Handle countdown and session start
    const handleStartClick = useCallback(async () => {
        setState('countdown');

        // Initialize session while counting down
        const data = await initializeSession();

        // Countdown
        for (let i = 3; i > 0; i--) {
            setCountdown(i);
            await new Promise(r => setTimeout(r, 1000));
        }

        if (data) {
            setState('active');
            // Note: startLive will need the systemPrompt which is now set
            await startLive();
        } else {
            setState('prep');
        }
    }, [initializeSession, startLive]);

    // Handle session end
    const handleSessionEnd = useCallback(async () => {
        stopLive();
        setState('processing');

        if (!user || !sessionData) return;

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/live-session/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    sessionId: sessionData.sessionId,
                    transcript: userTranscript,
                    durationSeconds: duration
                })
            });

            if (res.ok) {
                const data = await res.json();
                setResults(data);
                setState('results');
            }
        } catch (error) {
            console.error('Error completing session:', error);
            setState('results');
        }
    }, [user, sessionData, userTranscript, duration, stopLive]);

    // Manual stop button
    const handleStopClick = () => {
        handleSessionEnd();
    };

    // Format duration as MM:SS
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-gray-950/80 backdrop-blur-lg border-b border-white/5">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <button
                        onClick={() => router.push('/practice')}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="font-medium">Live Session</span>
                    <div className="w-9" />
                </div>
            </header>

            <main className="pt-20 pb-8 px-4 max-w-lg mx-auto">
                <AnimatePresence mode="wait">
                    {/* Loading State */}
                    {state === 'loading' && (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center min-h-[60vh]"
                        >
                            <SpinnerGap className="w-12 h-12 animate-spin text-purple-500" />
                            <p className="mt-4 text-gray-400">Loading session...</p>
                        </motion.div>
                    )}

                    {/* Prep State */}
                    {state === 'prep' && (
                        <motion.div
                            key="prep"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-6"
                        >
                            <div className="text-center">
                                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <Microphone className="w-10 h-10" weight="fill" />
                                </div>
                                <h1 className="text-2xl font-bold mb-2">Ready to Practice?</h1>
                                <p className="text-gray-400">
                                    You'll have a 2-minute conversation with an AI partner.
                                    Try to use the phrases naturally!
                                </p>
                            </div>

                            {/* Phrases to practice */}
                            <div className="bg-gray-900 rounded-xl p-4">
                                <h3 className="font-medium mb-3 flex items-center gap-2">
                                    <span className="text-purple-400">Target Phrases</span>
                                    <span className="text-xs bg-purple-500/20 px-2 py-0.5 rounded-full">
                                        {eligiblePhrases.length}
                                    </span>
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {eligiblePhrases.slice(0, 10).map((p: any, i: number) => (
                                        <div key={i} className="text-sm">
                                            <span className="text-white">{p.phrase}</span>
                                            <span className="text-gray-500 ml-2">– {p.meaning}</span>
                                        </div>
                                    ))}
                                    {eligiblePhrases.length > 10 && (
                                        <p className="text-xs text-gray-500">
                                            +{eligiblePhrases.length - 10} more
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Tips */}
                            <div className="bg-gray-900 rounded-xl p-4">
                                <h3 className="font-medium mb-2">💡 Tips</h3>
                                <ul className="text-sm text-gray-400 space-y-1">
                                    <li>• Speak naturally, don't force phrases</li>
                                    <li>• The AI will guide the conversation</li>
                                    <li>• It's okay to make mistakes!</li>
                                </ul>
                            </div>

                            <button
                                onClick={handleStartClick}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 font-semibold text-lg hover:opacity-90 transition-opacity"
                            >
                                Start Conversation
                            </button>
                        </motion.div>
                    )}

                    {/* Countdown State */}
                    {state === 'countdown' && (
                        <motion.div
                            key="countdown"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.2 }}
                            className="flex flex-col items-center justify-center min-h-[60vh]"
                        >
                            <motion.div
                                key={countdown}
                                initial={{ scale: 1.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-8xl font-bold text-purple-500"
                            >
                                {countdown}
                            </motion.div>
                            <p className="mt-4 text-gray-400">Get ready...</p>
                        </motion.div>
                    )}

                    {/* Active State */}
                    {state === 'active' && (
                        <motion.div
                            key="active"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-6"
                        >
                            {/* Timer */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 text-3xl font-mono font-bold">
                                    <Clock className="w-8 h-8 text-purple-500" />
                                    <span>{formatDuration(duration)}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">
                                    {duration < 120 ? 'Conversation in progress...' : 'Time to wrap up!'}
                                </p>
                            </div>

                            {/* Status indicators */}
                            <div className="flex justify-center gap-4">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isRecording ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                    <Microphone className="w-4 h-4" />
                                    <span className="text-sm">
                                        {isRecording ? 'Listening...' : 'Mic off'}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isSpeaking ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-500'
                                    }`}>
                                    <SpeakerHigh className="w-4 h-4" />
                                    <span className="text-sm">
                                        {isSpeaking ? 'AI Speaking...' : 'Waiting'}
                                    </span>
                                </div>
                            </div>

                            {/* Live visualization */}
                            <div className="flex justify-center items-center h-32">
                                <div className="flex gap-1">
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-2 bg-purple-500 rounded-full"
                                            animate={{
                                                height: isRecording ? [8, 32, 8] : 8,
                                            }}
                                            transition={{
                                                duration: 0.5,
                                                repeat: Infinity,
                                                delay: i * 0.05,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Error display */}
                            {liveError && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                                    {liveError}
                                </div>
                            )}

                            {/* Stop button */}
                            <button
                                onClick={handleStopClick}
                                className="w-full py-4 rounded-2xl bg-gray-800 font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <MicrophoneSlash className="w-5 h-5" />
                                End Conversation
                            </button>
                        </motion.div>
                    )}

                    {/* Processing State */}
                    {state === 'processing' && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center min-h-[60vh]"
                        >
                            <SpinnerGap className="w-12 h-12 animate-spin text-purple-500" />
                            <p className="mt-4 text-gray-400">Analyzing your conversation...</p>
                        </motion.div>
                    )}

                    {/* Results State */}
                    {state === 'results' && results && (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-6"
                        >
                            {/* Score */}
                            <div className="text-center">
                                <div className="text-6xl font-bold mb-2">
                                    {results.score}%
                                </div>
                                <p className="text-gray-400">{results.feedback}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {results.passedCount}/{results.totalCount} phrases used • {formatDuration(results.durationSeconds)}
                                </p>
                            </div>

                            {/* Phrase results */}
                            <div className="bg-gray-900 rounded-xl p-4">
                                <h3 className="font-medium mb-3">Phrase Usage</h3>
                                <div className="space-y-3">
                                    {results.results.map((r, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-start gap-3 p-2 rounded-lg ${r.used ? 'bg-green-500/10' : 'bg-red-500/10'
                                                }`}
                                        >
                                            {r.used ? (
                                                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" weight="fill" />
                                            ) : (
                                                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" weight="fill" />
                                            )}
                                            <div>
                                                <p className="font-medium">{r.phrase}</p>
                                                {r.context && (
                                                    <p className="text-sm text-gray-400 mt-0.5">
                                                        "{r.context}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <button
                                    onClick={() => router.push('/practice')}
                                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 font-semibold"
                                >
                                    Back to Practice
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
