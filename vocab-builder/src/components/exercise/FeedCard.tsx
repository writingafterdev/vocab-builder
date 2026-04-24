'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FeedCard as FeedCardType } from '@/lib/db/types';
import { SOURCE_PLATFORM_CONFIG, QUESTION_TYPE_LABELS, SKILL_AXIS_COLORS } from '@/lib/exercise/config';

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
    const skillColors = SKILL_AXIS_COLORS[card.skillAxis];
    const questionLabel = card.questionType
        ? QUESTION_TYPE_LABELS[card.questionType]
        : card.prompt;

    const renderHighlightedContext = (text: string, phrase?: string) => {
        if (!phrase) return text;

        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'ig');
        const parts = text.split(regex);

        if (parts.length === 1) return text;

        return parts.map((part, index) => {
            const isMatch = part.toLowerCase() === phrase.toLowerCase();
            if (!isMatch) {
                return <span key={`${part}-${index}`}>{part}</span>;
            }

            return (
                <span
                    key={`${part}-${index}`}
                    className="rounded-[0.3rem] bg-indigo-50 px-1 py-0.5 text-indigo-900 shadow-[inset_0_-1px_0_rgba(79,70,229,0.25)]"
                >
                    {part}
                </span>
            );
        });
    };

    const getOptionStateClass = (index: number) => {
        const isSelected = selectedIndex === index;
        const isCorrectOption = index === card.correctIndex;

        if (!answered) {
            return 'border-neutral-200 text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50';
        }

        if (isCorrectOption) {
            return 'border-emerald-200 bg-emerald-50/70 text-emerald-950';
        }

        if (isSelected) {
            return 'border-rose-200 bg-rose-50/80 text-rose-900';
        }

        return 'border-neutral-100 text-neutral-400 bg-neutral-50/60';
    };

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
            <div className="w-full h-[500px] md:h-[280px] bg-white border border-neutral-200 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400 md:px-6 md:pt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs">{platformConfig.emoji}</span>
                        <span>{platformConfig.label}</span>
                    </div>
                    {card.isRetry && <span className="text-amber-700">Retry</span>}
                </div>

                <div className="flex-1 px-5 pb-4 pt-4 md:px-6 md:pb-3 md:pt-3">
                    <div className="flex h-full flex-col justify-between border-y border-neutral-100 py-5 md:py-4">
                        <div className="space-y-4">
                            <p
                                className="text-center text-[1.7rem] leading-[1.55] text-neutral-900 md:text-[1.25rem] md:leading-[1.5]"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                {renderHighlightedContext(card.sourceContent, card.vocabPhrase)}
                            </p>

                            <div className="space-y-2 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-400">
                                    Guided Practice
                                </p>
                                <p className="mx-auto max-w-[34rem] text-sm leading-relaxed text-neutral-700 md:text-[0.9rem]">
                                    {card.prompt}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => onFixIt?.(card.linkedSessionId!)}
                            className="mt-6 flex min-h-12 w-full items-center justify-between border border-neutral-200 px-4 py-3 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-50 md:min-h-11"
                        >
                            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-500">
                                Open full repair
                            </span>
                            <span className="text-lg leading-none text-neutral-400">↗</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 text-[10px] uppercase tracking-[0.24em] md:px-6 md:py-2.5">
                    <span className="text-neutral-400">~{Math.ceil(card.estimatedSeconds / 60)} min</span>
                    <span className={skillColors.accent}>
                        {card.skillAxis.replace('_', ' ')}
                    </span>
                </div>
            </div>
        );
    }

    // Standard interactive card (ab_natural, spot_flaw, spot_intruder, retry)
    return (
        <div className="w-full h-[500px] md:h-[280px] bg-white border border-neutral-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400 md:px-6 md:pt-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs">{platformConfig.emoji}</span>
                    <span>{platformConfig.label}</span>
                </div>
                <div className="flex items-center gap-3">
                    {card.learningBand && (
                        <span className="text-neutral-400">
                            {card.learningBand.replace('_', ' ')}
                        </span>
                    )}
                    {card.isRetry && <span className="text-amber-700">Retry</span>}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-4 md:px-6 md:pb-3 md:pt-3">
                <div className="flex min-h-0 flex-1 flex-col border-y border-neutral-100 py-5 md:py-4">
                    <div className="space-y-3">
                        <p
                            className="text-center text-[1.55rem] leading-[1.55] text-neutral-900 md:text-[1.15rem] md:leading-[1.5]"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                        >
                            {renderHighlightedContext(card.sourceContent, card.vocabPhrase)}
                        </p>

                        <div className="space-y-1 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-400">
                                {questionLabel}
                            </p>
                            <p className="mx-auto max-w-[34rem] text-sm leading-relaxed text-neutral-700 md:text-[0.9rem]">
                                {card.prompt}
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
                        <div className="border-y border-neutral-100">
                            {(card.options || []).map((option, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelect(i)}
                                    disabled={answered}
                                    className={`flex min-h-14 w-full items-start gap-4 border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-b-0 md:min-h-12 ${getOptionStateClass(i)}`}
                                >
                                    <span className="w-4 pt-0.5 text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-400">
                                        {String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="flex-1 text-[1rem] leading-relaxed md:text-[0.95rem]">
                                        {option}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {answered ? (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="border-t border-neutral-100 px-1 pt-3"
                        >
                            <p className="text-xs leading-relaxed text-neutral-600 md:text-[0.78rem]">
                                <span className={isCorrect ? 'text-emerald-700' : 'text-rose-700'}>
                                    {isCorrect ? 'Correct.' : 'Not quite.'}
                                </span>{' '}
                                {card.explanation}
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={false}
                            className="flex items-center justify-between border-t border-neutral-100 px-1 pt-3 text-[10px] uppercase tracking-[0.24em]"
                        >
                            <span className="text-neutral-400">~{card.estimatedSeconds}s</span>
                            <span className={skillColors.accent}>
                                {card.skillAxis.replace('_', ' ')}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
