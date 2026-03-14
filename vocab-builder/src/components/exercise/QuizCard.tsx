'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Zap, Sparkles, Target, Brain, Lightbulb, Eye, MessageCircle } from 'lucide-react';
import type { InlineQuestion } from '@/lib/db/types';
import { cn } from '@/lib/utils';

// Interaction Components
import { McqInteraction } from './quiz-interactions/McqInteraction';
import { TypeInInteraction } from './quiz-interactions/TypeInInteraction';
import { TimedMcqInteraction } from './quiz-interactions/TimedMcqInteraction';
import { TapOrderInteraction } from './quiz-interactions/TapOrderInteraction';
import { FlipRecallInteraction } from './quiz-interactions/FlipRecallInteraction';
import { EmojiReactionInteraction } from './quiz-interactions/EmojiReactionInteraction';
import { MatchPairsInteraction } from './quiz-interactions/MatchPairsInteraction';
import { HighlightErrorInteraction } from './quiz-interactions/HighlightErrorInteraction';

interface QuizCardProps {
    question: InlineQuestion;
    onAnswer: (answer: number, earnedXpOverride?: number) => void;
    onSkip: () => void;
    hasAnswered: boolean;
    result: 'correct' | 'wrong' | null;
    xpEarned: number;
}

// Map the AI formats to our interaction types.
type InteractionType = 'mcq' | 'type_in' | 'timed_mcq' | 'tap_order' | 'flip_recall' | 'emoji' | 'match_pairs' | 'highlight_error';

const FORMAT_CONFIG: Record<InteractionType, { label: string; accent: string; icon: typeof Zap }> = {
    mcq: { label: 'Quick Check', accent: 'text-blue-500', icon: Target },
    type_in: { label: 'Type the Word', accent: 'text-violet-500', icon: MessageCircle },
    timed_mcq: { label: 'Speed Round', accent: 'text-red-500', icon: Zap },
    tap_order: { label: 'Build the Phrase', accent: 'text-emerald-500', icon: Sparkles },
    flip_recall: { label: 'Memory Flip', accent: 'text-amber-500', icon: Brain },
    emoji: { label: 'Read the Tone', accent: 'text-pink-500', icon: Eye },
    match_pairs: { label: 'Match Meaning', accent: 'text-teal-500', icon: Lightbulb },
    highlight_error: { label: 'Spot Error', accent: 'text-orange-500', icon: Target },
};

export function QuizCard({
    question,
    onAnswer,
    onSkip,
    hasAnswered,
    result,
    xpEarned,
}: QuizCardProps) {
    const emotion = (question as any).emotion || '';
    const aiFormat = (question as any).format || 'fill_blank';

    const interactionType = useMemo<InteractionType>(() => {
        if (aiFormat === 'tone_read') return 'emoji';
        if (aiFormat === 'spot_error') return 'highlight_error';
        if (aiFormat === 'best_response') return 'mcq';
        if (aiFormat === 'true_false') return 'mcq';

        const activeFormats: InteractionType[] = ['mcq', 'type_in', 'timed_mcq', 'tap_order', 'flip_recall'];
        return activeFormats[Math.floor(Math.random() * activeFormats.length)];
    }, [aiFormat]);

    const config = FORMAT_CONFIG[interactionType];
    const IconComponent = config.icon;

    const handleAnswer = (index: number, bonusTargetXp?: number) => {
        onAnswer(index, bonusTargetXp);
    };

    const renderInteraction = () => {
        const props = { question, onAnswer: handleAnswer, hasAnswered, result };

        switch (interactionType) {
            case 'type_in': return <TypeInInteraction {...props} />;
            case 'timed_mcq': return <TimedMcqInteraction {...props} />;
            case 'tap_order': return <TapOrderInteraction {...props} />;
            case 'flip_recall': return <FlipRecallInteraction {...props} />;
            case 'emoji': return <EmojiReactionInteraction {...props} />;
            case 'match_pairs': return <MatchPairsInteraction {...props} />;
            case 'highlight_error': return <HighlightErrorInteraction {...props} />;
            case 'mcq':
            default: return <McqInteraction {...props} />;
        }
    };

    return (
        <div
            className="w-full h-[280px] bg-white text-neutral-900 flex flex-col overflow-hidden relative border border-neutral-200"
        >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-8 md:px-12 pt-4 pb-1 relative z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <IconComponent className={cn('w-3.5 h-3.5', config.accent)} />
                    <span className={cn('text-[11px] font-semibold uppercase tracking-[0.15em]', config.accent)}>
                        {config.label}
                    </span>
                </div>
                {emotion && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-400 font-medium">
                        {emotion}
                    </span>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 px-8 md:px-12 py-2 overflow-y-auto relative z-10 custom-scrollbar flex flex-col justify-center">
                {interactionType !== 'flip_recall' && interactionType !== 'match_pairs' && (
                    <p
                        className="text-[14px] leading-[1.75] text-neutral-600 line-clamp-3 shrink-0"
                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                    >
                        {question.scenario}
                    </p>
                )}

                {renderInteraction()}
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-8 md:px-12 py-3 border-t border-neutral-100 relative z-10 shrink-0 bg-white/90">
                <AnimatePresence mode="wait">
                    {hasAnswered ? (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 min-w-0 flex-1 mr-2"
                        >
                            {result === 'correct' ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                    <span className="text-[12px] font-medium text-emerald-600">
                                        Nailed it
                                    </span>
                                    {xpEarned > 0 && (
                                        <span className="text-[11px] font-bold text-blue-500 ml-1">
                                            +{xpEarned} XP
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    <span className="text-[12px] text-neutral-500 truncate">
                                        {question.explanation || 'Not quite'}
                                    </span>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.span
                            key="phrase"
                            className="text-[11px] text-neutral-400 italic truncate"
                        >
                            "{question.phrase}"
                        </motion.span>
                    )}
                </AnimatePresence>

                {!hasAnswered && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSkip(); }}
                        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400 hover:text-neutral-800 transition-colors flex-shrink-0 ml-4 py-1"
                    >
                        Skip →
                    </button>
                )}
            </div>
        </div>
    );
}
