'use client';

/**
 * InsightsCard - Summary of strength, tip, and focus area
 */

import { Check, Lightbulb, Target } from 'lucide-react';

interface InsightsCardProps {
    insights: {
        strength: string;
        tip: string;
        focusArea: string;
    };
}

export function InsightsCard({ insights }: InsightsCardProps) {
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800">Key Insights</h4>

            {/* Strength */}
            <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-slate-700 text-sm">{insights.strength}</p>
            </div>

            {/* Tip */}
            <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-slate-700 text-sm">
                    <span className="font-medium text-amber-700">Tip:</span> {insights.tip}
                </p>
            </div>

            {/* Focus Area */}
            <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <Target className="w-4 h-4 text-teal-600" />
                </div>
                <p className="text-slate-700 text-sm">
                    <span className="font-medium text-teal-700">Focus Area:</span> {insights.focusArea}
                </p>
            </div>
        </div>
    );
}
