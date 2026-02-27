'use client';

/**
 * SessionSummaryCard - End-of-session summary for turn-based practice
 * 
 * Shows:
 * - Overall score with visual representation
 * - Phrases used and missed
 * - Key moments from the conversation
 * - Improvement suggestions
 */

import { Button } from '@/components/ui/button';

interface KeyMoment {
    turnIndex: number;
    highlight: string;
    feedback: string;
}

interface SessionSummary {
    overallScore: number;
    phrasesUsedWell: string[];
    phrasesMissed: string[];
    keyMoments: KeyMoment[];
    suggestions: string[];
    encouragement: string;
}

interface SessionSummaryCardProps {
    summary: SessionSummary;
    onClose: () => void;
}

export function SessionSummaryCard({ summary, onClose }: SessionSummaryCardProps) {
    const scoreColor =
        summary.overallScore >= 8 ? 'text-emerald-400' :
            summary.overallScore >= 5 ? 'text-amber-400' : 'text-red-400';

    const scoreEmoji =
        summary.overallScore >= 8 ? '🎉' :
            summary.overallScore >= 5 ? '👍' : '💪';

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
                {/* Header */}
                <div className="text-center">
                    <div className="text-5xl mb-2">{scoreEmoji}</div>
                    <h2 className="text-2xl font-bold text-white mb-1">Session Complete!</h2>
                    <p className="text-white/70">{summary.encouragement}</p>
                </div>

                {/* Score */}
                <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-white/50 text-sm mb-1">Overall Score</p>
                    <div className={`text-4xl font-bold ${scoreColor}`}>
                        {summary.overallScore}/10
                    </div>
                    <div className="flex justify-center gap-1 mt-2">
                        {[...Array(10)].map((_, i) => (
                            <div
                                key={i}
                                className={`w-3 h-3 rounded-full ${i < summary.overallScore
                                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                                        : 'bg-slate-600'
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Phrases Summary */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                        <p className="text-emerald-300 text-sm font-medium mb-2">
                            ✅ Phrases Used ({summary.phrasesUsedWell.length})
                        </p>
                        <div className="space-y-1">
                            {summary.phrasesUsedWell.length > 0 ? (
                                summary.phrasesUsedWell.map((phrase, i) => (
                                    <p key={i} className="text-sm text-white/80">{phrase}</p>
                                ))
                            ) : (
                                <p className="text-sm text-white/50 italic">None</p>
                            )}
                        </div>
                    </div>
                    <div className="bg-slate-500/10 border border-slate-500/30 rounded-xl p-3">
                        <p className="text-slate-300 text-sm font-medium mb-2">
                            ○ Missed ({summary.phrasesMissed.length})
                        </p>
                        <div className="space-y-1">
                            {summary.phrasesMissed.length > 0 ? (
                                summary.phrasesMissed.map((phrase, i) => (
                                    <p key={i} className="text-sm text-white/60">{phrase}</p>
                                ))
                            ) : (
                                <p className="text-sm text-white/50 italic">None - Great!</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Key Moments */}
                {summary.keyMoments.length > 0 && (
                    <div>
                        <h3 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                            <span>✨</span> Key Moments
                        </h3>
                        <div className="space-y-2">
                            {summary.keyMoments.map((moment, i) => (
                                <div key={i} className="bg-white/5 rounded-lg p-3">
                                    <p className="text-white font-medium">{moment.highlight}</p>
                                    <p className="text-sm text-white/60 mt-1">{moment.feedback}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Suggestions */}
                {summary.suggestions.length > 0 && (
                    <div>
                        <h3 className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                            <span>💡</span> Tips for Next Time
                        </h3>
                        <ul className="space-y-2">
                            {summary.suggestions.map((suggestion, i) => (
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

                {/* Close Button */}
                <Button
                    onClick={onClose}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                    Continue Practice
                </Button>
            </div>
        </div>
    );
}
