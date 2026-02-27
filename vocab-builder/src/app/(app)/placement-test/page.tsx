'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { PlacementTask, TaskResponse } from '@/lib/placement-test';

type TestState = 'intro' | 'recording' | 'processing' | 'complete';

export default function PlacementTestPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [tasks, setTasks] = useState<PlacementTask[]>([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [testState, setTestState] = useState<TestState>('intro');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [responses, setResponses] = useState<TaskResponse[]>([]);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch tasks on mount
    useEffect(() => {
        async function loadTasks() {
            try {
                const res = await fetch('/api/placement-test/tasks');
                if (res.ok) {
                    const data = await res.json();
                    setTasks(data.tasks);
                }
            } catch (e) {
                console.error('Failed to load tasks:', e);
            } finally {
                setLoading(false);
            }
        }
        loadTasks();
    }, []);

    const currentTask = tasks[currentTaskIndex];
    const progress = tasks.length > 0 ? ((currentTaskIndex) / tasks.length) * 100 : 0;

    // Start recording
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            chunksRef.current = [];
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);

            // Timer
            timerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);

        } catch (e) {
            console.error('Failed to start recording:', e);
            setError('Could not access microphone');
        }
    }, []);

    // Stop recording and save response
    const stopRecording = useCallback(async () => {
        if (!mediaRecorderRef.current || !currentTask) return;

        return new Promise<void>((resolve) => {
            mediaRecorderRef.current!.onstop = async () => {
                // Stop timer
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }

                // Convert to base64
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();

                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];

                    const response: TaskResponse = {
                        taskId: currentTask.id,
                        audioBase64: base64,
                        mimeType: 'audio/webm',
                        duration: recordingTime
                    };

                    setResponses(prev => [...prev, response]);
                    setIsRecording(false);
                    resolve();
                };

                reader.readAsDataURL(blob);

                // Stop all tracks
                mediaRecorderRef.current!.stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorderRef.current!.stop();
        });
    }, [currentTask, recordingTime]);

    // Move to next task or submit
    const handleNext = async () => {
        if (isRecording) {
            await stopRecording();
        }

        if (currentTaskIndex < tasks.length - 1) {
            setCurrentTaskIndex(i => i + 1);
            setRecordingTime(0);
        } else {
            // Submit all responses
            await submitTest();
        }
    };

    // Submit test for analysis
    const submitTest = async () => {
        if (!user) return;

        setTestState('processing');

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/placement-test/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({ responses })
            });

            if (res.ok) {
                const data = await res.json();
                setResult(data.result);
                setTestState('complete');
            } else {
                const err = await res.json();
                setError(err.error || 'Analysis failed');
                setTestState('recording');
            }
        } catch (e) {
            console.error('Submit failed:', e);
            setError('Failed to submit test');
            setTestState('recording');
        }
    };

    // Start test
    const startTest = () => {
        setTestState('recording');
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
        );
    }

    // Intro screen
    if (testState === 'intro') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 flex items-center justify-center">
                <div className="max-w-md w-full text-center">
                    <div className="text-6xl mb-6">🎯</div>
                    <h1 className="text-2xl font-bold text-white mb-4">
                        English Level Assessment
                    </h1>
                    <p className="text-white/70 mb-6">
                        Complete 4 short speaking tasks to determine your proficiency level.
                        This helps us personalize your learning experience.
                    </p>

                    <div className="bg-white/5 rounded-xl p-4 mb-6 text-left">
                        <h3 className="text-white font-medium mb-3">What to expect:</h3>
                        <ul className="space-y-2 text-sm text-white/70">
                            <li className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">1</span>
                                Read a short passage aloud
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">2</span>
                                Share your opinion on a topic
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">3</span>
                                Respond to a situation
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">4</span>
                                Quick word association
                            </li>
                        </ul>
                    </div>

                    <p className="text-sm text-white/50 mb-6">
                        ⏱️ Takes about 2-3 minutes
                    </p>

                    <Button
                        onClick={startTest}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                        Start Assessment
                    </Button>
                </div>
            </div>
        );
    }

    // Processing screen
    if (testState === 'processing') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Analyzing Your Responses</h2>
                    <p className="text-white/60">This may take a moment...</p>
                </div>
            </div>
        );
    }

    // Results screen
    if (testState === 'complete' && result) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
                <div className="max-w-md mx-auto pt-8">
                    <div className="text-center mb-8">
                        <div className="text-5xl mb-4">🎉</div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Your Level: {result.proficiencyLabel}
                        </h1>
                        <p className="text-white/60">{result.feedback}</p>
                    </div>

                    {/* Score Breakdown */}
                    <div className="bg-white/5 rounded-xl p-4 mb-6">
                        <h3 className="text-white font-medium mb-4">Score Breakdown</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Pronunciation', score: result.pronunciation, color: 'blue' },
                                { label: 'Vocabulary', score: result.vocabulary, color: 'emerald' },
                                { label: 'Fluency', score: result.fluency, color: 'amber' },
                                { label: 'Complexity', score: result.complexity, color: 'purple' },
                            ].map(({ label, score, color }) => (
                                <div key={label}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-white/70">{label}</span>
                                        <span className="text-white font-medium">{score}%</span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full bg-${color}-500 rounded-full transition-all`}
                                            style={{ width: `${score}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Strengths */}
                    {result.strengths?.length > 0 && (
                        <div className="bg-emerald-500/10 rounded-xl p-4 mb-4">
                            <h3 className="text-emerald-400 font-medium mb-2 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Your Strengths
                            </h3>
                            <ul className="space-y-1 text-sm text-white/80">
                                {result.strengths.map((s: string, i: number) => (
                                    <li key={i}>• {s}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Areas to Improve */}
                    {result.areasToImprove?.length > 0 && (
                        <div className="bg-amber-500/10 rounded-xl p-4 mb-6">
                            <h3 className="text-amber-400 font-medium mb-2">📚 Focus Areas</h3>
                            <ul className="space-y-1 text-sm text-white/80">
                                {result.areasToImprove.map((s: string, i: number) => (
                                    <li key={i}>• {s}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <Button
                        onClick={() => router.push('/practice')}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                        Start Practicing
                    </Button>
                </div>
            </div>
        );
    }

    // Recording screen
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
            <div className="max-w-md mx-auto">
                {/* Progress */}
                <div className="mb-6">
                    <div className="flex justify-between text-sm text-white/60 mb-2">
                        <span>Task {currentTaskIndex + 1} of {tasks.length}</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-purple-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Task Card */}
                {currentTask && (
                    <div className="bg-white/5 backdrop-blur rounded-xl p-6 mb-6">
                        <h2 className="text-lg font-bold text-white mb-4">
                            {currentTask.title}
                        </h2>
                        <p className="text-white/80 whitespace-pre-line">
                            {currentTask.prompt}
                        </p>
                    </div>
                )}

                {/* Timer */}
                <div className="text-center mb-6">
                    <div className="text-4xl font-mono text-white mb-2">
                        {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                    </div>
                    <p className="text-sm text-white/50">
                        Suggested: ~{currentTask?.expectedDuration || 20}s
                    </p>
                </div>

                {/* Recording Controls */}
                <div className="flex flex-col items-center gap-4">
                    {!isRecording ? (
                        <button
                            onClick={startRecording}
                            className="w-20 h-20 rounded-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center transition-all hover:scale-105"
                        >
                            <Mic className="w-8 h-8 text-white" />
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center animate-pulse"
                        >
                            <MicOff className="w-8 h-8 text-white" />
                        </button>
                    )}

                    <p className="text-sm text-white/60">
                        {isRecording ? 'Tap to stop & continue' : 'Tap to start recording'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="mt-4 p-3 bg-red-500/20 rounded-lg text-red-300 text-sm text-center">
                        {error}
                    </div>
                )}

                {/* Skip button (if already recorded this task) */}
                {responses.some(r => r.taskId === currentTask?.id) && (
                    <button
                        onClick={handleNext}
                        className="mt-6 w-full py-3 text-white/60 hover:text-white flex items-center justify-center gap-2"
                    >
                        Continue <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
