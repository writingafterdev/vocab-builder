'use client';

import React from 'react';
import { SOURCE_CATALOG } from '@/lib/source-catalog';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface FeedFilterProps {
    activeSource: string | null;
    activeSection: string | null;
    activeTopic: string | null;
    onSourceChange: (sourceId: string | null) => void;
    onSectionChange: (sectionId: string | null) => void;
    onTopicChange: (topic: string | null) => void;
}

// Exact same topic list as QuoteSwiper FEED_TOPICS
const TOPICS = [
    { id: 'All',        label: 'All',        emoji: '✨' },
    { id: 'technology', label: 'Technology', emoji: '💻' },
    { id: 'science',    label: 'Science',    emoji: '🔬' },
    { id: 'business',   label: 'Business',   emoji: '💼' },
    { id: 'psychology', label: 'Psychology', emoji: '🧠' },
    { id: 'culture',    label: 'Culture',    emoji: '🏛' },
    { id: 'philosophy', label: 'Philosophy', emoji: '💭' },
    { id: 'world',      label: 'World',      emoji: '🌍' },
    { id: 'health',     label: 'Health',     emoji: '❤️‍🩹' },
    { id: 'politics',   label: 'Politics',   emoji: '⚖️' },
    { id: 'art',        label: 'Art',        emoji: '🎨' },
];

// Layer 1: primary source pills — bold, bordered, attention-grabbing
const sourcePillClass = (isActive: boolean) =>
    `flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-bold uppercase tracking-[0.08em] transition-all duration-200 ${
        isActive
            ? 'bg-neutral-900 border-neutral-900 text-white'
            : 'bg-transparent border-neutral-200 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900'
    }`;

// Layers 2 & 3: secondary refinement chips — quieter, no border on idle, smaller visual weight
const refinePillClass = (isActive: boolean) =>
    `flex-shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-all duration-150 rounded-sm ${
        isActive
            ? 'bg-neutral-100 text-neutral-900 font-semibold'
            : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50'
    }`;

export function FeedFilter({
    activeSource,
    activeSection,
    activeTopic,
    onSourceChange,
    onSectionChange,
    onTopicChange
}: FeedFilterProps) {
    const selectedSourceDef = activeSource ? SOURCE_CATALOG.find(s => s.id === activeSource) : null;

    return (
        <div className="w-full space-y-0 mb-8">
            {/* LAYER 1: SOURCES */}
            <div className="flex gap-2 overflow-x-auto pb-3 mt-2 no-scrollbar scroll-smooth border-b border-neutral-200">
                <button
                    onClick={() => { onSourceChange(null); onSectionChange(null); }}
                    className={sourcePillClass(!activeSource)}
                >
                    <span className="text-sm">🌐</span>
                    <span>All Sources</span>
                </button>
                {SOURCE_CATALOG.map(source => {
                    const isActive = activeSource === source.id;
                    const activeStyle = isActive && source.themeParams ? {
                        backgroundColor: source.themeParams.accentColor,
                        borderColor: source.themeParams.accentColor,
                        color: '#ffffff',
                    } : {};
                    return (
                        <button
                            key={source.id}
                            onClick={() => { onSourceChange(source.id); onSectionChange(null); }}
                            className={sourcePillClass(isActive)}
                            style={activeStyle}
                        >
                            <span className="text-sm">{source.icon}</span>
                            <span>{source.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* LAYER 2: SECTIONS — only when source has them */}
            {selectedSourceDef?.hasSections && selectedSourceDef.sections && (
                <div className="flex gap-2 overflow-x-auto pt-2 pb-2 no-scrollbar scroll-smooth animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                        onClick={() => onSectionChange(null)}
                        className={refinePillClass(!activeSection)}
                        style={!activeSection && selectedSourceDef.themeParams ? {
                            color: selectedSourceDef.themeParams.accentColor,
                        } : {}}
                    >
                        <span>All</span>
                    </button>
                    {selectedSourceDef.sections.map(sec => {
                        const isSecActive = activeSection === sec.id;
                        return (
                            <button
                                key={sec.id}
                                onClick={() => onSectionChange(sec.id)}
                                className={refinePillClass(isSecActive)}
                                style={isSecActive && selectedSourceDef.themeParams ? {
                                    color: selectedSourceDef.themeParams.accentColor,
                                } : {}}
                            >
                                <span>{sec.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* LAYER 3: TOPICS — exact same pattern as QuoteSwiper Topic Filter Bar */}
            <div className="flex gap-2 overflow-x-auto pt-2 pb-3 no-scrollbar scroll-smooth border-b border-neutral-100">
                {TOPICS.map(topic => {
                    const isAll = topic.id === 'All';
                    const targetVal = isAll ? null : topic.id;
                    const isActive = activeTopic === targetVal;
                    return (
                        <button
                            key={topic.id}
                            onClick={() => onTopicChange(targetVal)}
                            className={refinePillClass(isActive)}
                        >
                            <span className="text-xs">{topic.emoji}</span>
                            <span>{topic.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
