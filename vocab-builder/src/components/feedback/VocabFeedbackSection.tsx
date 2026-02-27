'use client';

/**
 * VocabFeedbackSection - Container for vocabulary feedback cards
 */

import { VocabDetailedFeedback } from '@/lib/speaking-feedback';
import { VocabCard } from './VocabCard';

interface VocabFeedbackSectionProps {
    feedback: VocabDetailedFeedback[];
}

export function VocabFeedbackSection({ feedback }: VocabFeedbackSectionProps) {
    if (feedback.length === 0) return null;

    // Sort: issues first, then good, then perfect, then not_used
    const sorted = [...feedback].sort((a, b) => {
        const order = { issues: 0, good: 1, perfect: 2, not_used: 3 };
        return order[a.status] - order[b.status];
    });

    const usedCount = feedback.filter(f => f.used).length;
    const perfectCount = feedback.filter(f => f.status === 'perfect').length;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">
                    Vocabulary Feedback
                </h3>
                <span className="text-sm text-slate-500">
                    {usedCount}/{feedback.length} used
                    {perfectCount > 0 && (
                        <span className="text-green-600 ml-2">
                            ({perfectCount} perfect!)
                        </span>
                    )}
                </span>
            </div>

            <div className="space-y-3">
                {sorted.map(fb => (
                    <VocabCard
                        key={fb.phraseId}
                        feedback={fb}
                        defaultExpanded={fb.status === 'issues'}
                    />
                ))}
            </div>
        </div>
    );
}
