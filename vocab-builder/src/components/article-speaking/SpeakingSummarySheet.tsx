'use client';

/**
 * SpeakingSummarySheet - Session summary when user completes or pauses
 * 
 * Features:
 * - Overall score (weighted average)
 * - Skill breakdown
 * - Top weaknesses
 * - Chunks with issues
 * - Save to progress
 */

import { motion } from 'framer-motion';
import { X, CheckCircle2, AlertTriangle, RotateCcw, Home, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScoreCircle } from '@/components/feedback/ScoreCircle';
import { SkillsRadar } from '@/components/feedback/SkillsRadar';
import type { SpeakingAnalysisResult, ExtractedWeakness, extractWeaknesses } from '@/lib/speaking-feedback';
import { useEffect, useState } from 'react';

interface ChunkResult {
    chunkIndex: number;
    chunk: string;
    feedback: SpeakingAnalysisResult | null;
    attempts: number;
    status: 'pending' | 'recording' | 'analyzing' | 'complete' | 'skipped';
}

interface SpeakingSummarySheetProps {
    results: ChunkResult[];
    articleId: string;
    userId: string;
    onClose: () => void;
    onFinish: () => void;
    isComplete: boolean;
}

export function SpeakingSummarySheet({
    results,
    articleId,
    userId,
    onClose,
    onFinish,
    isComplete
}: SpeakingSummarySheetProps) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Calculate aggregate scores
    const completedResults = results.filter(r => r.status === 'complete' && r.feedback);
    const totalWords = completedResults.reduce((sum, r) => sum + r.chunk.split(/\s+/).length, 0);

    // Weighted average overall score
    const overallScore = completedResults.length > 0
        ? Math.round(
            completedResults.reduce((sum, r) => {
                const weight = r.chunk.split(/\s+/).length / totalWords;
                return sum + (r.feedback!.overallScore * weight);
            }, 0)
        )
        : 0;

    // Aggregate skill scores
    const aggregateSkills = {
        pronunciation: { score: 0, issues: [] as any[] },
        fluency: { score: 0, speechRate: 0, pauseCount: 0, fillers: [] as string[] },
        vocabulary: 100,
        grammar: { score: 100, errors: [] },
        connectedSpeech: { score: 0, patterns: [] as any[] }
    };

    if (completedResults.length > 0) {
        let totalPronScore = 0, totalFluencyScore = 0, totalCSScore = 0;

        completedResults.forEach(r => {
            const fb = r.feedback!;
            const weight = r.chunk.split(/\s+/).length / totalWords;

            totalPronScore += fb.skills.pronunciation.score * weight;
            totalFluencyScore += fb.skills.fluency.score * weight;
            totalCSScore += fb.skills.connectedSpeech.score * weight;

            // Collect all issues
            aggregateSkills.pronunciation.issues.push(...fb.skills.pronunciation.issues);
            aggregateSkills.connectedSpeech.patterns.push(...fb.skills.connectedSpeech.patterns);
        });

        aggregateSkills.pronunciation.score = Math.round(totalPronScore);
        aggregateSkills.fluency.score = Math.round(totalFluencyScore);
        aggregateSkills.connectedSpeech.score = Math.round(totalCSScore);
    }

    // Extract top weaknesses
    const allWeaknesses: Map<string, { count: number; examples: string[] }> = new Map();

    aggregateSkills.pronunciation.issues.forEach(issue => {
        const key = issue.issue || 'unknown';
        const existing = allWeaknesses.get(key) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 3) {
            existing.examples.push(issue.word);
        }
        allWeaknesses.set(key, existing);
    });

    const topWeaknesses = Array.from(allWeaknesses.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

    // Chunks with issues (score < 70)
    const chunksWithIssues = completedResults.filter(r => r.feedback!.overallScore < 70);

    // Save progress
    const saveProgress = async () => {
        setSaving(true);
        try {
            const response = await fetch('/api/user/speaking-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify({
                    articleId,
                    overallScore,
                    skills: aggregateSkills,
                    chunksCompleted: completedResults.length,
                    totalChunks: results.length,
                    weaknesses: topWeaknesses.map(([issue, data]) => ({
                        issue,
                        count: data.count,
                        examples: data.examples
                    }))
                })
            });

            if (response.ok) {
                setSaved(true);
            }
        } catch (error) {
            console.error('[Speaking Summary] Save error:', error);
        }
        setSaving(false);
    };

    // Auto-save on mount if complete
    useEffect(() => {
        if (isComplete && !saved) {
            saveProgress();
        }
    }, [isComplete]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-slate-900/95 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">
                        {isComplete ? 'Session Complete!' : 'Your Progress'}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5 text-slate-400" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Overall score */}
                    <div className="flex items-center gap-6">
                        <ScoreCircle score={overallScore} size="xl" />
                        <div>
                            <h3 className="text-white font-semibold text-lg">
                                {overallScore >= 80 ? 'Excellent pronunciation!' :
                                    overallScore >= 60 ? 'Good work!' : 'Keep practicing!'}
                            </h3>
                            <p className="text-slate-400">
                                {completedResults.length} of {results.length} chunks completed
                            </p>
                        </div>
                    </div>

                    {/* Skills radar */}
                    <div className="bg-slate-900/50 rounded-xl p-4">
                        <h4 className="text-slate-400 text-sm mb-4">Skill Breakdown</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-center">
                                <div className={`text-2xl font-bold ${aggregateSkills.pronunciation.score >= 70 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {aggregateSkills.pronunciation.score}%
                                </div>
                                <div className="text-slate-400">Pronunciation</div>
                            </div>
                            <div className="text-center">
                                <div className={`text-2xl font-bold ${aggregateSkills.fluency.score >= 70 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {aggregateSkills.fluency.score}%
                                </div>
                                <div className="text-slate-400">Fluency</div>
                            </div>
                            <div className="text-center">
                                <div className={`text-2xl font-bold ${aggregateSkills.connectedSpeech.score >= 70 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {aggregateSkills.connectedSpeech.score}%
                                </div>
                                <div className="text-slate-400">Connected Speech</div>
                            </div>
                        </div>
                    </div>

                    {/* Top weaknesses */}
                    {topWeaknesses.length > 0 && (
                        <div>
                            <h4 className="text-slate-400 text-sm mb-3">Areas to Improve</h4>
                            <div className="space-y-2">
                                {topWeaknesses.map(([issue, data], i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 bg-red-900/20 border border-red-700/30 rounded-lg p-3"
                                    >
                                        <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                                        <div className="flex-1">
                                            <span className="text-white font-medium">{issue}</span>
                                            <span className="text-slate-400 ml-2">
                                                ({data.count} occurrences)
                                            </span>
                                        </div>
                                        <span className="text-slate-500 text-sm">
                                            e.g., {data.examples.slice(0, 2).join(', ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Chunks with issues */}
                    {chunksWithIssues.length > 0 && (
                        <div>
                            <h4 className="text-slate-400 text-sm mb-3">
                                Chunks That Need Practice ({chunksWithIssues.length})
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {chunksWithIssues.map((r, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3"
                                    >
                                        <span className="text-amber-400 font-medium">
                                            {r.feedback!.overallScore}%
                                        </span>
                                        <p className="text-slate-300 text-sm truncate flex-1">
                                            {r.chunk.slice(0, 80)}...
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Save status */}
                    {saved && (
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            Progress saved to your profile
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between p-6 border-t border-slate-700">
                    {!isComplete && (
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="text-slate-400"
                        >
                            Continue Practice
                        </Button>
                    )}

                    <div className="flex gap-3 ml-auto">
                        {!saved && (
                            <Button
                                variant="outline"
                                onClick={saveProgress}
                                disabled={saving}
                                className="text-teal-400 border-teal-600"
                            >
                                {saving ? (
                                    <>Saving...</>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Progress
                                    </>
                                )}
                            </Button>
                        )}

                        <Button
                            onClick={onFinish}
                            className="bg-teal-600 hover:bg-teal-500"
                        >
                            <Home className="h-4 w-4 mr-2" />
                            Finish
                        </Button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
