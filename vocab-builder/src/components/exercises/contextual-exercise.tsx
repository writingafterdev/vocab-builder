'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, AlertTriangle, Lightbulb } from 'lucide-react';

interface ContextualExerciseProps {
    theme: string;
    question: string;
    phrases: string[];
    hints: string[];
    onComplete: (result: {
        success: boolean;
        phraseResults: PhraseResult[];
    }) => void;
    userEmail: string;
}

interface PhraseResult {
    phrase: string;
    status: 'natural' | 'forced' | 'missing';
    feedback: string;
}

export default function ContextualExercise({
    theme,
    question,
    phrases,
    hints,
    onComplete,
    userEmail,
}: ContextualExerciseProps) {
    const [userResponse, setUserResponse] = useState('');
    const [showHints, setShowHints] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [result, setResult] = useState<{
        phraseResults: PhraseResult[];
        passed: boolean;
    } | null>(null);

    const handleSubmit = async () => {
        if (userResponse.trim().length < 20) {
            return;
        }

        setEvaluating(true);

        try {
            const response = await fetch('/api/user/evaluate-exercise', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({
                    question,
                    userResponse,
                    phrases,
                    phraseIds: [],
                    contextIds: [],
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setResult({
                    phraseResults: data.phraseResults || [],
                    passed: data.passed,
                });
            } else {
                setResult({
                    phraseResults: phrases.map(p => ({
                        phrase: p,
                        status: 'missing' as const,
                        feedback: 'Failed to evaluate.',
                    })),
                    passed: false,
                });
            }
        } catch (error) {
            console.error('Evaluation error:', error);
            setResult({
                phraseResults: phrases.map(p => ({
                    phrase: p,
                    status: 'missing' as const,
                    feedback: 'Failed to evaluate.',
                })),
                passed: false,
            });
        } finally {
            setEvaluating(false);
        }
    };

    const handleContinue = () => {
        if (result) {
            onComplete({
                success: result.passed,
                phraseResults: result.phraseResults,
            });
        }
    };

    const handleRetry = () => {
        setResult(null);
        setUserResponse('');
    };

    const getStatusIcon = (status: 'natural' | 'forced' | 'missing') => {
        switch (status) {
            case 'natural':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'forced':
                return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'missing':
                return <XCircle className="h-4 w-4 text-red-400" />;
        }
    };

    const getStatusStyle = (status: 'natural' | 'forced' | 'missing') => {
        switch (status) {
            case 'natural':
                return 'border-green-200 bg-green-50';
            case 'forced':
                return 'border-amber-200 bg-amber-50';
            case 'missing':
                return 'border-red-200 bg-red-50';
        }
    };

    const getStatusLabel = (status: 'natural' | 'forced' | 'missing') => {
        switch (status) {
            case 'natural':
                return 'Natural';
            case 'forced':
                return 'Awkward';
            case 'missing':
                return 'Not used';
        }
    };

    // Result view
    if (result) {
        return (
            <div className="space-y-6">
                {/* Pass/Fail indicator */}
                <div className="flex items-center justify-center gap-3">
                    {result.passed ? (
                        <>
                            <CheckCircle className="h-8 w-8 text-green-500" />
                            <span className="text-lg font-medium text-green-600">Great job!</span>
                        </>
                    ) : (
                        <>
                            <AlertTriangle className="h-8 w-8 text-amber-500" />
                            <span className="text-lg font-medium text-amber-600">Keep practicing!</span>
                        </>
                    )}
                </div>

                {/* Per-phrase feedback */}
                <div className="space-y-3">
                    {result.phraseResults.map((pr, i) => (
                        <div key={i} className={`rounded-lg border p-3 ${getStatusStyle(pr.status)}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {getStatusIcon(pr.status)}
                                <span className="font-medium text-neutral-900">{pr.phrase}</span>
                                <Badge variant="outline" className="text-xs ml-auto">
                                    {getStatusLabel(pr.status)}
                                </Badge>
                            </div>
                            {pr.feedback && (
                                <p className="text-sm text-neutral-600 ml-6">{pr.feedback}</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* User's response */}
                <div className="bg-white border rounded-lg p-4">
                    <p className="text-xs text-neutral-400 mb-1">Your response:</p>
                    <p className="text-neutral-600 text-sm">{userResponse}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    {!result.passed && (
                        <Button variant="outline" onClick={handleRetry} className="flex-1">
                            Try Again
                        </Button>
                    )}
                    <Button onClick={handleContinue} className="flex-1">
                        {result.passed ? 'Continue' : 'Continue Anyway'}
                    </Button>
                </div>
            </div>
        );
    }

    // Exercise view
    return (
        <div className="space-y-6">
            {/* Theme badge */}
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-medium">
                    {theme}
                </Badge>
            </div>

            {/* Question */}
            <h2 className="text-xl font-serif text-neutral-900 leading-relaxed">
                {question}
            </h2>

            {/* Phrase hints toggle */}
            <div>
                <button
                    onClick={() => setShowHints(!showHints)}
                    className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                    <Lightbulb className="h-4 w-4" />
                    {showHints ? 'Hide' : 'Show'} phrases to use ({phrases.length})
                </button>

                {showHints && (
                    <div className="mt-3 space-y-2">
                        {phrases.map((phrase, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm">
                                <Badge variant="outline">{phrase}</Badge>
                                <span className="text-neutral-400 text-xs">{hints[i]}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Response textarea */}
            <Textarea
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
                placeholder="Write your response here... Try to naturally incorporate the phrases."
                className="min-h-[150px] text-base"
            />

            {/* Character count */}
            <p className="text-xs text-neutral-400 text-right">
                {userResponse.length} characters
                {userResponse.length < 50 && userResponse.length > 0 && (
                    <span className="text-amber-500 ml-2">Write at least 50 characters</span>
                )}
            </p>

            {/* Submit button */}
            <Button
                onClick={handleSubmit}
                disabled={userResponse.trim().length < 20 || evaluating}
                className="w-full"
            >
                {evaluating ? (
                    <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Evaluating...
                    </>
                ) : (
                    'Submit Response'
                )}
            </Button>
        </div>
    );
}
