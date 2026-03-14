'use client';

import { Loader2, Sparkles } from 'lucide-react';
import type { Register, Nuance, SocialDistance } from '@/lib/db/types';

interface TagSelectorProps {
    phrase: string;
    meaning: string;
    context?: string;
    isLoading?: boolean;
    // AI-assigned tags (read-only)
    selectedRegister: Register | Register[];
    selectedNuance: Nuance | Nuance[];
    selectedSocialDistance?: SocialDistance[];
    selectedTopic: string | string[];
    selectedSubtopic?: string | string[];
    isHighFrequency?: boolean;
}

// Display configs
const REGISTER_CONFIG: Record<Register, { label: string; color: string }> = {
    casual: { label: 'Casual', color: 'bg-green-100 text-green-700' },
    consultative: { label: 'Consultative', color: 'bg-blue-100 text-blue-700' },
    formal: { label: 'Formal', color: 'bg-purple-100 text-purple-700' },
};

const NUANCE_CONFIG: Record<Nuance, { label: string; color: string }> = {
    positive: { label: 'Positive', color: 'bg-emerald-100 text-emerald-700' },
    slightly_positive: { label: 'Slightly +', color: 'bg-lime-100 text-lime-700' },
    neutral: { label: 'Neutral', color: 'bg-slate-100 text-slate-600' },
    slightly_negative: { label: 'Slightly -', color: 'bg-orange-100 text-orange-700' },
    negative: { label: 'Negative', color: 'bg-red-100 text-red-700' },
};

const SOCIAL_DISTANCE_CONFIG: Record<SocialDistance, { label: string; color: string }> = {
    close: { label: 'Close', color: 'bg-pink-100 text-pink-700' },
    friendly: { label: 'Friendly', color: 'bg-amber-100 text-amber-700' },
    neutral: { label: 'Neutral', color: 'bg-slate-100 text-slate-600' },
    hierarchical_up: { label: 'To Boss', color: 'bg-indigo-100 text-indigo-700' },
    hierarchical_down: { label: 'To Staff', color: 'bg-cyan-100 text-cyan-700' },
    hierarchical_peer: { label: 'Peers', color: 'bg-teal-100 text-teal-700' },
    professional: { label: 'Business', color: 'bg-violet-100 text-violet-700' },
};

// Helper to normalize to array
function toArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export function TagSelector({
    isLoading,
    selectedRegister,
    selectedNuance,
    selectedSocialDistance,
    selectedTopic,
    selectedSubtopic,
    isHighFrequency = false,
}: TagSelectorProps) {
    // Normalize arrays
    const registers = toArray(selectedRegister);
    const nuances = toArray(selectedNuance);
    const socialDistances = toArray(selectedSocialDistance);
    const topics = toArray(selectedTopic);
    const subtopics = toArray(selectedSubtopic);
    const primaryTopic = topics[0] || 'general';
    const primarySubtopic = subtopics[0];

    if (isLoading) {
        return (
            <div className="border-t border-slate-100 p-3 bg-slate-50/50">
                <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs">Analyzing phrase...</span>
                </div>
            </div>
        );
    }

    const formatLabel = (id: string) =>
        id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Render multi-value badges
    const renderBadges = <T extends string>(
        values: T[],
        config: Record<T, { label: string; color: string }>
    ) => (
        <div className="flex flex-wrap gap-1">
            {values.length === 0 ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500">—</span>
            ) : values.map((value) => (
                <span
                    key={value}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${config[value]?.color || 'bg-slate-100 text-slate-600'}`}
                >
                    {config[value]?.label || value}
                </span>
            ))}
        </div>
    );

    return (
        <div className="border-t border-slate-100 p-3 bg-slate-50/50 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Sparkles className="h-3 w-3" />
                <span>AI-assigned tags</span>
            </div>

            <div className="space-y-2">
                {/* Topic & Subtopic (AI-assigned, read-only) */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Topic:</span>
                    <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                            {formatLabel(primaryTopic)}{primarySubtopic ? ` / ${formatLabel(primarySubtopic)}` : ''}
                        </span>
                    </div>
                </div>

                {/* Register */}
                {(() => {
                    const isUniversal = registers.length === 3;
                    if (isUniversal) {
                        return (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Register:</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                                    Universal (All Registers)
                                </span>
                            </div>
                        );
                    }
                    return (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Register:</span>
                            {renderBadges(registers, REGISTER_CONFIG)}
                        </div>
                    );
                })()}

                {/* Nuance */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Nuance:</span>
                    {renderBadges(nuances, NUANCE_CONFIG)}
                </div>

                {/* Social Distance */}
                {(() => {
                    if (socialDistances.length === 0) {
                        return (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Social:</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                    General
                                </span>
                            </div>
                        );
                    }

                    const isVersatile = socialDistances.length > 3;
                    if (isVersatile) {
                        return (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Social:</span>
                                <div className="group relative">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 cursor-help">
                                        Versatile ({socialDistances.length} contexts)
                                        <div className="invisible group-hover:visible absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-800 text-white rounded shadow-xl z-50 flex flex-wrap gap-1">
                                            {socialDistances.map(sd => (
                                                <span key={sd} className="text-[10px] opacity-90 block">
                                                    {SOCIAL_DISTANCE_CONFIG[sd]?.label}
                                                </span>
                                            ))}
                                            <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                                        </div>
                                    </span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Social:</span>
                            {renderBadges(socialDistances, SOCIAL_DISTANCE_CONFIG)}
                        </div>
                    );
                })()}

                {/* High Frequency (read-only) */}
                {isHighFrequency && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-16 uppercase tracking-wider font-semibold">Freq:</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                            ⚡ High Frequency
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default TagSelector;

