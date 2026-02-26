'use client';

/**
 * Daily Drill Page
 * Targeted practice based on user's past weaknesses
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DrillExercise } from '@/components/practice/DrillExercise';
import { SpinnerGap } from '@phosphor-icons/react';
import { ArrowLeft, CheckCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Drill {
    id: string;
    type: 'pronunciation' | 'grammar_fix' | 'register_choice' | 'nuance_match' | 'collocation_fill';
    weaknessId: string;
    weaknessCategory: string;
    instruction: string;
    prompt: string;
    options?: string[];
    correctAnswer?: string;
    explanation: string;
}

export default function DailyDrillPage() {
    const router = useRouter();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [drills, setDrills] = useState<Drill[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [completed, setCompleted] = useState(false);

    // Generate drills on mount
    useEffect(() => {
        async function generateDrills() {
            if (!user) return;

            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/daily-drill/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ count: 3 })
                });

                if (!response.ok) throw new Error('Failed to generate drills');

                const data = await response.json();

                if (data.drills.length === 0) {
                    toast.info(data.message || 'No weaknesses to practice!');
                    router.push('/practice');
                    return;
                }

                setSessionId(data.sessionId);
                setDrills(data.drills);
            } catch (error) {
                console.error('[Daily Drill] Failed to load:', error);
                toast.error('Failed to load drills');
                router.push('/practice');
            } finally {
                setLoading(false);
            }
        }

        generateDrills();
    }, [user, router]);

    const handleDrillComplete = async (drillId: string, weaknessId: string, correct: boolean) => {
        if (!user) return;

        // Update count
        if (correct) {
            setCorrectCount(prev => prev + 1);
        }

        // Move to next or complete IMMEDIATELY to prevent UI sticking
        if (currentIndex < drills.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setCompleted(true);
        }

        // Submit to API non-blocking
        user.getIdToken().then(token => {
            return fetch('/api/daily-drill/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    drillId,
                    weaknessId,
                    correct,
                    performance: correct ? 100 : 20
                })
            });
        }).catch(error => {
            console.error('[Daily Drill] Failed to submit result:', error);
        });
    };

    const handleBack = () => {
        router.push('/practice');
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
                <SpinnerGap className="w-10 h-10 animate-spin text-teal-500" />
                <p className="text-slate-600">Preparing your drill exercises...</p>
            </div>
        );
    }

    // Completion state
    if (completed) {
        const accuracy = Math.round((correctCount / drills.length) * 100);

        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
                <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-teal-600" />
                    </div>

                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Drill Complete!</h1>
                    <p className="text-slate-500 mb-6">
                        You got {correctCount} out of {drills.length} correct ({accuracy}%)
                    </p>

                    <div className="flex items-center justify-center gap-2 mb-6 text-amber-500">
                        <Zap className="w-5 h-5" />
                        <span className="font-semibold">+{correctCount * 10} XP</span>
                    </div>

                    <Button onClick={handleBack} className="w-full bg-teal-600 hover:bg-teal-700">
                        Back to Practice
                    </Button>
                </div>
            </div>
        );
    }

    const currentDrill = drills[currentIndex];
    if (!currentDrill) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-4 py-3">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <button onClick={handleBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>

                    <div className="text-center">
                        <h1 className="font-semibold text-slate-800">Daily Drill</h1>
                        <p className="text-xs text-slate-500">
                            {currentIndex + 1} of {drills.length}
                        </p>
                    </div>

                    <div className="text-sm text-teal-600 font-medium">
                        {correctCount} correct
                    </div>
                </div>
            </header>

            {/* Progress bar */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-2xl mx-auto px-4">
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-teal-500 transition-all duration-300"
                            style={{ width: `${((currentIndex + 1) / drills.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Drill content */}
            <main className="max-w-2xl mx-auto p-4 pt-8">
                <DrillExercise
                    key={currentDrill.id}
                    drill={currentDrill}
                    onComplete={handleDrillComplete}
                />
            </main>
        </div>
    );
}
