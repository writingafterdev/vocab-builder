'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AIEvaluationResult } from '@/lib/db/types';

interface FeedbackPanelProps {
    result: AIEvaluationResult & {
        whatWorked?: string;
        phraseAnalysis?: Array<{
            phrase: string;
            contextFit: 'good' | 'mismatch' | 'awkward';
            feedback: string;
            socialReasoning?: string;
            naturalAlternative?: string;
        }>;
        nativeWouldSay?: string;
        overallScore?: number;
    };
    targetPhrase: string;
    expectedRegister?: string;
    expectedNuance?: string;
    onContinue?: () => void;
}

const NATURALNESS_CONFIG = {
    natural: {
        icon: '✨',
        label: 'Natural',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
    },
    forced: {
        icon: '⚡',
        label: 'Acceptable',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
    },
    incorrect: {
        icon: '💡',
        label: 'Needs Work',
        color: 'text-rose-600',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
    },
};

const CONTEXT_FIT_CONFIG = {
    good: { icon: '✓', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    mismatch: { icon: '✗', color: 'text-rose-500', bg: 'bg-rose-50' },
    awkward: { icon: '~', color: 'text-amber-500', bg: 'bg-amber-50' },
};

export function FeedbackPanel({
    result,
    targetPhrase,
    expectedRegister,
    expectedNuance,
    onContinue,
}: FeedbackPanelProps) {
    const naturalness = result.naturalness || 'natural';
    const config = NATURALNESS_CONFIG[naturalness] || NATURALNESS_CONFIG.natural;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl mx-auto space-y-4"
        >
            {/* Header with score */}
            <div className={cn(
                "rounded-xl p-4 border-2",
                config.bg,
                config.border
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{config.icon}</span>
                        <div>
                            <span className={cn("text-lg font-semibold", config.color)}>
                                {config.label}
                            </span>
                            {result.overallScore && (
                                <span className="ml-2 text-sm text-slate-500">
                                    Score: {result.overallScore}/10
                                </span>
                            )}
                        </div>
                    </div>
                    {result.correct && (
                        <span className="text-2xl">🎉</span>
                    )}
                </div>

                {/* Main feedback */}
                <p className="mt-3 text-slate-700">
                    {result.feedback}
                </p>
            </div>

            {/* What worked section */}
            {result.whatWorked && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-emerald-50 rounded-lg p-3 border border-emerald-100"
                >
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">✅</span>
                        <div>
                            <p className="text-sm font-medium text-emerald-700">What worked</p>
                            <p className="text-sm text-emerald-600">{result.whatWorked}</p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Phrase-by-phrase analysis */}
            {result.phraseAnalysis && result.phraseAnalysis.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-2"
                >
                    <p className="text-sm font-medium text-slate-500">Phrase Analysis</p>
                    {result.phraseAnalysis.map((analysis, i) => {
                        const fitConfig = CONTEXT_FIT_CONFIG[analysis.contextFit];
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "rounded-lg p-3 border",
                                    fitConfig?.bg || 'bg-slate-50',
                                    "border-slate-200"
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <span className={cn("text-lg", fitConfig?.color)}>
                                        {fitConfig?.icon || '•'}
                                    </span>
                                    <div className="flex-1">
                                        <span className="font-medium text-slate-800">
                                            "{analysis.phrase}"
                                        </span>
                                        <p className="text-sm text-slate-600 mt-1">
                                            {analysis.feedback}
                                        </p>
                                        {analysis.naturalAlternative && (
                                            <p className="text-sm text-blue-600 mt-1">
                                                💡 Native alternative: "{analysis.naturalAlternative}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            )}

            {/* Register context */}
            {expectedRegister && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="bg-blue-50 rounded-lg p-3 border border-blue-100"
                >
                    <div className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">🎭</span>
                        <div>
                            <p className="text-sm font-medium text-blue-700">Register Context</p>
                            <p className="text-sm text-blue-600">
                                This situation called for <strong>{expectedRegister}</strong> language
                                {expectedNuance && ` with a ${expectedNuance} tone`}.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Native would say */}
            {result.nativeWouldSay && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg p-4 border border-violet-100"
                >
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">💬</span>
                        <div>
                            <p className="text-sm font-medium text-violet-700 mb-1">
                                A native speaker might say:
                            </p>
                            <blockquote className="text-violet-800 italic border-l-2 border-violet-300 pl-3">
                                "{result.nativeWouldSay}"
                            </blockquote>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Suggestion for improvement */}
            {result.suggestion && !result.correct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="bg-slate-50 rounded-lg p-3 border border-slate-200"
                >
                    <div className="flex items-start gap-2">
                        <span className="text-slate-500 mt-0.5">💡</span>
                        <div>
                            <p className="text-sm font-medium text-slate-600">Suggestion</p>
                            <p className="text-sm text-slate-700">{result.suggestion}</p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Continue button */}
            {onContinue && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    onClick={onContinue}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
                >
                    Continue
                </motion.button>
            )}
        </motion.div>
    );
}
