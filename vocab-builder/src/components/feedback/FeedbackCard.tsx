'use client';

/**
 * FeedbackCard - Comprehensive speaking feedback display
 * 
 * Shows:
 * - Phrase usage (✓/○)
 * - Intonation chart
 * - Language fit score
 * - Suggestions
 * - Try Again / Next buttons
 */

import { IntonationChart } from './IntonationChart';
import { SpeakingFeedback } from '@/lib/speaking-analysis';
import { Button } from '@/components/ui/button';

interface FeedbackCardProps {
    feedback: SpeakingFeedback;
    onRetry: () => void;
    onNext: () => void;
    canRetry: boolean;
    attemptCount: number;
    isComplete?: boolean;
}

export function FeedbackCard({
    feedback,
    onRetry,
    onNext,
    canRetry,
    attemptCount,
    isComplete
}: FeedbackCardProps) {
    const phraseScore = feedback.phrases.filter(p => p.usedCorrectly).length;
    const totalPhrases = feedback.phrases.length;
    const hasIntonationData = feedback.intonation.words.length > 0;

    return (
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur rounded-2xl p-6 space-y-6">
            {/* Header with encouragement */}
            <div className="text-center">
                <div className="text-4xl mb-2">
                    {phraseScore === totalPhrases ? '🎉' : phraseScore > 0 ? '👍' : '💪'}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                    {phraseScore === totalPhrases ? 'Excellent!' : phraseScore > 0 ? 'Good effort!' : 'Keep practicing!'}
                </h3>
                <p className="text-white/70">{feedback.encouragement}</p>
            </div>

            {/* Phrase Usage */}
            <div>
                <h4 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                    <span>📝</span> Phrase Usage ({phraseScore}/{totalPhrases})
                </h4>
                <div className="space-y-2">
                    {feedback.phrases.map((phrase) => (
                        <div
                            key={phrase.phraseId}
                            className={`flex items-start gap-3 p-3 rounded-lg ${phrase.usedCorrectly
                                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                                    : 'bg-slate-700/30 border border-slate-600/30'
                                }`}
                        >
                            <span className="mt-0.5">
                                {phrase.usedCorrectly ? '✅' : '○'}
                            </span>
                            <div>
                                <span className={`font-medium ${phrase.usedCorrectly ? 'text-emerald-300' : 'text-white/60'
                                    }`}>
                                    {phrase.phrase}
                                </span>
                                {phrase.note && (
                                    <p className="text-sm text-white/50 mt-1">{phrase.note}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Intonation Chart */}
            {hasIntonationData && (
                <div>
                    <h4 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                        <span>🎵</span> Intonation Pattern
                    </h4>
                    <IntonationChart
                        words={feedback.intonation.words}
                        expectedPattern={feedback.intonation.expectedPattern}
                        userPattern={feedback.intonation.userPattern}
                        keyMoments={feedback.intonation.keyMoments}
                    />
                </div>
            )}

            {/* Language Fit */}
            <div>
                <h4 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                    <span>🎯</span> Language Fit
                </h4>
                <div className="bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-white/70">Score</span>
                        <div className="flex items-center gap-2">
                            <div className="flex">
                                {[...Array(10)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-3 h-3 rounded-full mx-0.5 ${i < feedback.languageFit.score
                                                ? 'bg-amber-400'
                                                : 'bg-slate-600'
                                            }`}
                                    />
                                ))}
                            </div>
                            <span className="text-amber-400 font-bold">
                                {feedback.languageFit.score}/10
                            </span>
                        </div>
                    </div>
                    {feedback.languageFit.feedback && (
                        <p className="text-sm text-white/60">{feedback.languageFit.feedback}</p>
                    )}
                </div>
            </div>

            {/* Fluency */}
            <div className="flex items-center justify-between bg-slate-800/50 rounded-xl p-4">
                <span className="text-white/70">Fluency</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${feedback.fluency === 'natural'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : feedback.fluency === 'hesitant'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-red-500/20 text-red-300'
                    }`}>
                    {feedback.fluency === 'natural' ? '🌟 Natural' :
                        feedback.fluency === 'hesitant' ? '🤔 Hesitant' : '📝 Choppy'}
                </span>
            </div>

            {/* Suggestions */}
            {feedback.suggestions.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                        <span>💡</span> Tips for Improvement
                    </h4>
                    <ul className="space-y-2">
                        {feedback.suggestions.map((suggestion, i) => (
                            <li
                                key={i}
                                className="text-sm text-white/70 pl-4 border-l-2 border-purple-500/50"
                            >
                                {suggestion}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Overall Feedback */}
            {feedback.overallFeedback && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                    <p className="text-white/80">{feedback.overallFeedback}</p>
                </div>
            )}

            {/* Attempt indicator */}
            {attemptCount > 1 && (
                <p className="text-center text-white/40 text-sm">
                    Attempt {attemptCount} of 3
                </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {canRetry && !isComplete && (
                    <Button
                        variant="outline"
                        onClick={onRetry}
                        className="flex-1 border-white/20 text-white hover:bg-white/10"
                    >
                        🔄 Try Again
                    </Button>
                )}
                <Button
                    onClick={onNext}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                    {isComplete ? '✓ Complete Session' : 'Next Question →'}
                </Button>
            </div>
        </div>
    );
}
