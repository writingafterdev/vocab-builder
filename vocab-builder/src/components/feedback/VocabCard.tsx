'use client';

/**
 * VocabCard - Expandable vocabulary feedback card
 * Shows detailed feedback on register, nuance, pragmatics, collocation
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, AlertTriangle, X, Star, MessageCircle, Lightbulb } from 'lucide-react';
import { VocabDetailedFeedback } from '@/lib/speaking-feedback';
import { cn } from '@/lib/utils';

interface VocabCardProps {
    feedback: VocabDetailedFeedback;
    defaultExpanded?: boolean;
}

export function VocabCard({ feedback, defaultExpanded = false }: VocabCardProps) {
    const [expanded, setExpanded] = useState(defaultExpanded || feedback.status === 'issues');

    const statusConfig = {
        perfect: {
            icon: Check,
            color: 'text-green-600',
            bg: 'bg-green-50 border-green-200',
            label: 'Perfect!'
        },
        good: {
            icon: Check,
            color: 'text-teal-600',
            bg: 'bg-teal-50 border-teal-200',
            label: 'Good'
        },
        issues: {
            icon: AlertTriangle,
            color: 'text-amber-600',
            bg: 'bg-amber-50 border-amber-200',
            label: 'Issues'
        },
        not_used: {
            icon: X,
            color: 'text-slate-400',
            bg: 'bg-slate-50 border-slate-200',
            label: 'Not Used'
        }
    };

    const config = statusConfig[feedback.status];
    const StatusIcon = config.icon;

    return (
        <div className={cn(
            'rounded-lg border transition-all duration-200',
            config.bg
        )}>
            {/* Header */}
            <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg font-medium text-slate-800">
                        "{feedback.phrase}"
                    </span>
                    <span className={cn(
                        'flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full',
                        config.color,
                        feedback.status === 'perfect' && 'bg-green-100',
                        feedback.status === 'good' && 'bg-teal-100',
                        feedback.status === 'issues' && 'bg-amber-100',
                        feedback.status === 'not_used' && 'bg-slate-100'
                    )}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {config.label}
                    </span>
                </div>

                {expanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
            </button>

            {/* Expanded Content */}
            {expanded && (
                <div className="px-4 pb-4 space-y-4">

                    {/* Perfect usage - just show encouragement */}
                    {feedback.status === 'perfect' && feedback.encouragement && (
                        <div className="flex items-start gap-2 p-3 bg-green-100 rounded-lg">
                            <Star className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <p className="text-green-800">{feedback.encouragement}</p>
                        </div>
                    )}

                    {/* Not used - brief note */}
                    {feedback.status === 'not_used' && (
                        <p className="text-slate-600 text-sm">
                            This phrase wasn't used in your response. Try incorporating it next time!
                        </p>
                    )}

                    {/* Good/Issues - show detailed feedback */}
                    {(feedback.status === 'good' || feedback.status === 'issues') && (
                        <>
                            {/* Register */}
                            {feedback.register.status !== 'na' && (
                                <FeedbackSection
                                    title="Register"
                                    icon={<MessageCircle className="w-4 h-4" />}
                                    status={feedback.register.status === 'match'}
                                >
                                    {feedback.register.status === 'match' ? (
                                        <p className="text-slate-600">
                                            <span className="text-green-600 font-medium">✓ Match</span> —
                                            {feedback.register.expected} register fits this {feedback.register.actual} context
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-slate-700 mb-2">
                                                <span className="text-amber-600 font-medium">Mismatch:</span> Expected {feedback.register.expected}, used {feedback.register.actual}
                                            </p>
                                            <p className="text-slate-600 text-sm">{feedback.register.explanation}</p>
                                            {feedback.register.alternative && (
                                                <div className="mt-2 flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                                                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm">
                                                        <span className="font-medium">Try instead:</span> "{feedback.register.alternative}"
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </FeedbackSection>
                            )}

                            {/* Nuance */}
                            <FeedbackSection
                                title="Nuance"
                                icon={<NuanceStars score={feedback.nuance.score} />}
                                status={feedback.nuance.score >= 2}
                            >
                                <p className="text-slate-600">{feedback.nuance.explanation}</p>
                                {feedback.nuance.betterFit && feedback.nuance.score < 3 && (
                                    <div className="mt-2 flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                                        <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm">
                                            <span className="font-medium">Better fit:</span> "{feedback.nuance.betterFit}"
                                        </p>
                                    </div>
                                )}
                            </FeedbackSection>

                            {/* Pragmatics */}
                            {(feedback.pragmatics.context || !feedback.pragmatics.appropriate) && (
                                <FeedbackSection
                                    title="Pragmatics"
                                    icon={<span className="text-sm">🤝</span>}
                                    status={feedback.pragmatics.appropriate}
                                >
                                    {feedback.pragmatics.appropriate ? (
                                        <p className="text-slate-600">
                                            <span className="text-green-600 font-medium">✓ Appropriate</span> —
                                            {feedback.pragmatics.context}
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-slate-700 mb-1">
                                                <span className="font-medium">Context:</span> {feedback.pragmatics.context}
                                            </p>
                                            {feedback.pragmatics.issue && (
                                                <p className="text-amber-700 text-sm mb-2">{feedback.pragmatics.issue}</p>
                                            )}
                                            {feedback.pragmatics.suggestion && (
                                                <div className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                                                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm">
                                                        <span className="font-medium">Suggestion:</span> "{feedback.pragmatics.suggestion}"
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </FeedbackSection>
                            )}

                            {/* Collocation */}
                            {!feedback.collocation.correct && (
                                <FeedbackSection
                                    title="Collocation"
                                    status={false}
                                >
                                    <p className="text-slate-600 mb-2">{feedback.collocation.explanation}</p>
                                    <div className="text-sm">
                                        <span className="text-red-500 line-through">{feedback.collocation.actual}</span>
                                        <span className="mx-2">→</span>
                                        <span className="text-green-600 font-medium">{feedback.collocation.expected}</span>
                                    </div>
                                </FeedbackSection>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function FeedbackSection({
    title,
    icon,
    status,
    children
}: {
    title: string;
    icon?: React.ReactNode;
    status?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="border-l-2 pl-3 py-1 border-slate-200">
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="font-medium text-slate-700">{title}</span>
                {status !== undefined && (
                    status ? (
                        <Check className="w-4 h-4 text-green-500" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )
                )}
            </div>
            <div className="text-sm">{children}</div>
        </div>
    );
}

function NuanceStars({ score }: { score: 1 | 2 | 3 }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3].map(i => (
                <Star
                    key={i}
                    className={cn(
                        'w-3.5 h-3.5',
                        i <= score ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                    )}
                />
            ))}
        </div>
    );
}
