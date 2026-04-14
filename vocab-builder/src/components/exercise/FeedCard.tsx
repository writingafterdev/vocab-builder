'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FeedCard as FeedCardType } from '@/lib/db/types';
import { SOURCE_PLATFORM_CONFIG, FEED_CARD_COLORS, SKILL_AXIS_COLORS } from '@/lib/exercise/config';

interface FeedCardProps {
    card: FeedCardType;
    onAnswer: (cardId: string, correct: boolean) => void;
    onFixIt?: (sessionId: string) => void;
}

export default function FeedCardComponent({ card, onAnswer, onFixIt }: FeedCardProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [answered, setAnswered] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    const platformConfig = SOURCE_PLATFORM_CONFIG[card.sourcePlatform] || { emoji: '📄', label: 'Post' };
    const accentClass = FEED_CARD_COLORS[card.cardType] || 'border-l-neutral-400';
    const skillColors = SKILL_AXIS_COLORS[card.skillAxis];

    const handleSelect = (index: number) => {
        if (answered) return;
        setSelectedIndex(index);

        const correct = index === card.correctIndex;
        setIsCorrect(correct);
        setAnswered(true);
        onAnswer(card.id, correct);
    };

    // "Fix It" card → redirect to pre-generated session
    if (card.cardType === 'fix_it' && card.linkedSessionId) {
        return (
            <div className={`w-full h-[280px] bg-white border border-neutral-200 border-l-4 ${accentClass} flex flex-col overflow-hidden`}>
                <div className="flex-1 flex flex-col justify-center px-6 py-5">
                    {/* Platform badge */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm">{platformConfig.emoji}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            {platformConfig.label}
                        </span>
                        {card.isRetry && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 ml-auto">
                                ↻ Retry
                            </span>
                        )}
                    </div>

                    {/* Source content preview */}
                    <p className="text-sm text-neutral-700 leading-relaxed line-clamp-3 mb-4 italic"
                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                    >
                        "{card.sourceContent.slice(0, 150)}..."
                    </p>

                    {/* CTA */}
                    <button
                        onClick={() => onFixIt?.(card.linkedSessionId!)}
                        className="w-full py-3 bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-colors"
                    >
                        ✦ Fix this argument
                    </button>
                </div>

                {/* Time estimate */}
                <div className="px-6 py-2 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">~{Math.ceil(card.estimatedSeconds / 60)} min</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${skillColors.accent}`}>
                        {card.skillAxis.replace('_', ' ')}
                    </span>
                </div>
            </div>
        );
    }

    // Standard interactive card (ab_natural, spot_flaw, spot_intruder, retry)
    return (
        <div className={`w-full h-[280px] bg-white border border-neutral-200 border-l-4 ${accentClass} flex flex-col overflow-hidden`}>
            <div className="flex-1 flex flex-col px-6 py-5 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">{platformConfig.emoji}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        {platformConfig.label}
                    </span>
                    {card.isRetry && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 ml-auto">
                            ↻ Retry
                        </span>
                    )}
                </div>

                {/* Question */}
                <p className="text-sm font-semibold text-neutral-900 mb-3 line-clamp-2">
                    {card.prompt}
                </p>

                {/* Options */}
                <div className="space-y-1.5 flex-1 overflow-y-auto">
                    {(card.options || []).map((option, i) => {
                        const isSelected = selectedIndex === i;
                        const isCorrectOption = i === card.correctIndex;
                        
                        let optionClass = 'bg-white border-neutral-200 hover:border-neutral-400';
                        if (answered) {
                            if (isCorrectOption) {
                                optionClass = 'bg-emerald-50 border-emerald-300 text-emerald-900';
                            } else if (isSelected && !isCorrectOption) {
                                optionClass = 'bg-red-50 border-red-300 text-red-700';
                            } else {
                                optionClass = 'bg-neutral-50 border-neutral-200 text-neutral-400';
                            }
                        }

                        return (
                            <button
                                key={i}
                                onClick={() => handleSelect(i)}
                                disabled={answered}
                                className={`w-full px-3 py-2 text-left text-sm border transition-all ${optionClass}`}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Result footer */}
            <AnimatePresence>
                {answered && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="px-6 py-2.5 border-t border-neutral-100 bg-neutral-50"
                    >
                        <p className="text-xs text-neutral-600 line-clamp-2">
                            {isCorrect ? '✓ ' : '✗ '}{card.explanation}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Skill axis label */}
            {!answered && (
                <div className="px-6 py-2 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">~{card.estimatedSeconds}s</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${skillColors.accent}`}>
                        {card.skillAxis.replace('_', ' ')}
                    </span>
                </div>
            )}
        </div>
    );
}
