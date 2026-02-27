'use client';

/**
 * SpeakingAnalysisView - Main container for speaking feedback
 * 2-column desktop layout, stacked on mobile
 */

import { SpeakingAnalysisResult, extractWeaknesses } from '@/lib/speaking-feedback';
import { saveSessionWeaknesses } from '@/lib/db/user-weaknesses';
import { ScoreCircle } from './ScoreCircle';
import { VocabFeedbackSection } from './VocabFeedbackSection';
import { SkillsRadar } from './SkillsRadar';
import { IntonationGraph } from './IntonationGraph';
import { AnnotatedTranscript } from './AnnotatedTranscript';
import { InsightsCard } from './InsightsCard';
import { useEffect, useState } from 'react';

interface SpeakingAnalysisViewProps {
    result: SpeakingAnalysisResult;
    userId: string;
    onContinue: () => void;
}

export function SpeakingAnalysisView({
    result,
    userId,
    onContinue
}: SpeakingAnalysisViewProps) {
    const [weaknessesSaved, setWeaknessesSaved] = useState(false);

    // Save weaknesses for Daily Drill on mount
    useEffect(() => {
        async function saveWeaknesses() {
            if (weaknessesSaved) return;

            try {
                const weaknesses = extractWeaknesses(result);
                if (weaknesses.length > 0) {
                    await saveSessionWeaknesses(userId, weaknesses);
                }
                setWeaknessesSaved(true);
            } catch (error) {
                console.error('[SpeakingAnalysisView] Failed to save weaknesses:', error);
            }
        }

        saveWeaknesses();
    }, [result, userId, weaknessesSaved]);

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <ScoreCircle score={result.overallScore} size="lg" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Speaking Analysis</h1>
                        <p className="text-slate-500">Here's how you did</p>
                    </div>
                </div>

                {/* Main content - 2 columns on desktop */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Left Column - Vocabulary (3/5 width on desktop) */}
                    <div className="lg:col-span-3 space-y-6">
                        <VocabFeedbackSection feedback={result.vocabularyFeedback} />

                        <AnnotatedTranscript words={result.annotatedWords} />
                    </div>

                    {/* Right Column - Skills & Insights (2/5 width on desktop) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Skills Radar */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                            <h4 className="text-sm font-medium text-slate-600 mb-2">Speaking Skills</h4>
                            <SkillsRadar skills={result.skills} />

                            {/* Skill scores legend */}
                            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                                <SkillScore label="Pronunciation" value={result.skills.pronunciation.score} />
                                <SkillScore label="Fluency" value={result.skills.fluency.score} />
                                <SkillScore label="Vocabulary" value={result.skills.vocabulary} />
                                <SkillScore label="Grammar" value={result.skills.grammar.score} />
                                <SkillScore label="Connected Speech" value={result.skills.connectedSpeech.score} />
                            </div>
                        </div>

                        {/* Intonation Graph */}
                        <IntonationGraph intonation={result.intonation} />

                        {/* Insights */}
                        <InsightsCard insights={result.insights} />

                        {/* Continue Button */}
                        <button
                            onClick={onContinue}
                            className="w-full py-3 px-6 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Sub-components
// ============================================

function SkillScore({ label, value }: { label: string; value: number }) {
    const getColor = () => {
        if (value >= 80) return 'text-green-600';
        if (value >= 60) return 'text-amber-600';
        return 'text-red-600';
    };

    return (
        <div className="flex justify-between items-center">
            <span className="text-slate-600">{label}</span>
            <span className={`font-medium ${getColor()}`}>{value}%</span>
        </div>
    );
}
