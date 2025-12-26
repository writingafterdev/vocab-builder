'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getDuePhrasesbyType, reviewPhrases, updateContextMastery } from '@/lib/db/srs';
import { SavedPhrase } from '@/lib/db/types';
import ContextualExercise from '@/components/exercises/contextual-exercise';
import { toast } from 'sonner';

interface ExerciseBundle {
    theme: string;
    question: string;
    phrases: string[];
    phraseIds: string[];
    contextIds: string[];
    hints: string[];
}

interface BundledExercise {
    bundle: ExerciseBundle;
    sourcePhrases: SavedPhrase[];
}

export default function PracticeSessionPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const sessionType = searchParams.get('type') as 'passive' | 'active' || 'active';

    const [loading, setLoading] = useState(true);
    const [exercises, setExercises] = useState<BundledExercise[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [completed, setCompleted] = useState<boolean[]>([]);
    const [sessionComplete, setSessionComplete] = useState(false);

    useEffect(() => {
        async function loadExercises() {
            if (!user?.email) return;

            setLoading(true);
            try {
                const { passive, active } = await getDuePhrasesbyType(user.uid);

                if (sessionType === 'passive') {
                    // For passive, redirect to content generation
                    router.push('/feed?review=true');
                    return;
                }

                // Use active phrases for active session
                const phrasesForSession = active;

                if (phrasesForSession.length === 0) {
                    setLoading(false);
                    return;
                }

                // Group phrases by context for bundling
                const bundles = await generateBundles(phrasesForSession, user.email);

                setExercises(bundles);
                setCompleted(new Array(bundles.length).fill(false));

            } catch (error) {
                console.error('Error loading exercises:', error);
                toast.error('Failed to load exercises');
            } finally {
                setLoading(false);
            }
        }

        loadExercises();
    }, [user, sessionType, router]);

    /**
     * Group phrases into bundles of 3-5 by shared context
     */
    async function generateBundles(phrases: SavedPhrase[], userEmail: string): Promise<BundledExercise[]> {
        const bundles: BundledExercise[] = [];

        // Group by context if available
        const contextGroups: Map<string, SavedPhrase[]> = new Map();
        const noContextPhrases: SavedPhrase[] = [];

        phrases.forEach(phrase => {
            const currentContext = phrase.contexts?.[phrase.currentContextIndex ?? 0];
            if (currentContext?.id) {
                const existing = contextGroups.get(currentContext.id) || [];
                existing.push(phrase);
                contextGroups.set(currentContext.id, existing);
            } else {
                noContextPhrases.push(phrase);
            }
        });

        // Create bundles from context groups (max 4 phrases per bundle)
        for (const [contextId, groupPhrases] of contextGroups) {
            for (let i = 0; i < groupPhrases.length; i += 4) {
                const bundlePhrases = groupPhrases.slice(i, i + 4);
                const firstPhrase = bundlePhrases[0];
                const context = firstPhrase.contexts?.[firstPhrase.currentContextIndex ?? 0];

                if (context?.question) {
                    // Use pre-generated question
                    bundles.push({
                        bundle: {
                            theme: context.name,
                            question: context.question,
                            phrases: bundlePhrases.map(p => p.phrase),
                            phraseIds: bundlePhrases.map(p => p.id),
                            contextIds: bundlePhrases.map(() => contextId),
                            hints: bundlePhrases.map(p => p.meaning),
                        },
                        sourcePhrases: bundlePhrases,
                    });
                }
            }
        }

        // For phrases without contexts, generate bundled question via API
        if (noContextPhrases.length > 0) {
            for (let i = 0; i < noContextPhrases.length; i += 4) {
                const bundlePhrases = noContextPhrases.slice(i, i + 4);

                try {
                    const response = await fetch('/api/user/generate-exercise', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-email': userEmail,
                        },
                        body: JSON.stringify({
                            phrases: bundlePhrases.map(p => ({
                                phraseId: p.id,
                                phrase: p.phrase,
                                meaning: p.meaning,
                                contextId: 'general',
                                contextName: 'General Practice',
                                contextQuestion: '',
                            })),
                        }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        bundles.push({
                            bundle: data.bundle,
                            sourcePhrases: bundlePhrases,
                        });
                    }
                } catch (error) {
                    console.error('Error generating bundle:', error);
                    // Fallback bundle
                    bundles.push({
                        bundle: {
                            theme: 'Practice Session',
                            question: `How would you use "${bundlePhrases[0].phrase}" and the other phrases in a real conversation?`,
                            phrases: bundlePhrases.map(p => p.phrase),
                            phraseIds: bundlePhrases.map(p => p.id),
                            contextIds: bundlePhrases.map(() => 'general'),
                            hints: bundlePhrases.map(p => p.meaning),
                        },
                        sourcePhrases: bundlePhrases,
                    });
                }
            }
        }

        return bundles;
    }

    const handleExerciseComplete = async (result: {
        success: boolean;
        phraseResults: Array<{
            phrase: string;
            status: 'natural' | 'forced' | 'missing';
            feedback: string;
        }>;
    }) => {
        const current = exercises[currentIndex];

        // Mark as completed
        const newCompleted = [...completed];
        newCompleted[currentIndex] = true;
        setCompleted(newCompleted);

        // Update phrases in database
        try {
            const phraseIds = current.sourcePhrases.map(p => p.id);
            await reviewPhrases(phraseIds);

            // Update context mastery for phrases that were used naturally
            for (const pr of result.phraseResults.filter(r => r.status === 'natural')) {
                const sourcePhrase = current.sourcePhrases.find(p =>
                    p.phrase.toLowerCase() === pr.phrase.toLowerCase()
                );
                if (sourcePhrase) {
                    const contextId = sourcePhrase.contexts?.[sourcePhrase.currentContextIndex ?? 0]?.id;
                    const currentMastery = sourcePhrase.contexts?.[sourcePhrase.currentContextIndex ?? 0]?.masteryLevel ?? 0;
                    if (contextId) {
                        await updateContextMastery(sourcePhrase.id, contextId, Math.min(currentMastery + 1, 3));
                    }
                }
            }
        } catch (error) {
            console.error('Error updating phrases:', error);
        }

        // Move to next or finish
        if (currentIndex < exercises.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            // Update user's streak when session completes
            try {
                const { updateUserStreak } = await import('@/lib/db/users');
                if (user?.uid) {
                    await updateUserStreak(user.uid);
                }
            } catch (error) {
                console.error('Error updating streak:', error);
            }

            setSessionComplete(true);
            toast.success('Practice session complete! 🎉');
        }
    };

    if (!user) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500">Please sign in to practice.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mb-4" />
                <p className="text-neutral-500">Preparing your practice session...</p>
            </div>
        );
    }

    if (exercises.length === 0) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500 mb-4">No exercises available right now.</p>
                <Link href="/practice">
                    <Button variant="outline">Back to Practice</Button>
                </Link>
            </div>
        );
    }

    if (sessionComplete) {
        const totalPhrases = exercises.reduce((sum, ex) => sum + ex.bundle.phrases.length, 0);

        return (
            <div className="max-w-2xl mx-auto py-12 px-4">
                <Card>
                    <CardContent className="pt-8 text-center">
                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                            Session Complete!
                        </h2>
                        <p className="text-neutral-600 mb-6">
                            You practiced {totalPhrases} phrase{totalPhrases > 1 ? 's' : ''} across {exercises.length} exercise{exercises.length > 1 ? 's' : ''}.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <Link href="/practice">
                                <Button variant="outline">Back to Practice</Button>
                            </Link>
                            <Link href="/feed">
                                <Button>Browse Feed</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const currentExercise = exercises[currentIndex];

    return (
        <div className="max-w-2xl mx-auto py-6 px-4">
            <div className="flex items-center justify-between mb-6">
                <Link href="/practice">
                    <Button variant="ghost" size="sm" className="text-neutral-500">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Exit
                    </Button>
                </Link>
                <span className="text-sm text-neutral-500">
                    {currentIndex + 1} / {exercises.length}
                </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-neutral-100 rounded-full mb-6">
                <div
                    className="h-1 bg-green-500 rounded-full transition-all"
                    style={{ width: `${(currentIndex / exercises.length) * 100}%` }}
                />
            </div>

            {/* Current Exercise */}
            <Card>
                <CardContent className="pt-6">
                    <ContextualExercise
                        theme={currentExercise.bundle.theme}
                        question={currentExercise.bundle.question}
                        phrases={currentExercise.bundle.phrases}
                        hints={currentExercise.bundle.hints}
                        onComplete={handleExerciseComplete}
                        userEmail={user?.email || ''}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
