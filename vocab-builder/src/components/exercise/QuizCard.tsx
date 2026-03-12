'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
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
// We also add a randomizer so standard MCQs get variety.
type InteractionType = 'mcq' | 'type_in' | 'timed_mcq' | 'tap_order' | 'flip_recall' | 'emoji' | 'match_pairs' | 'highlight_error';

const FORMAT_LABELS: Record<InteractionType, string> = {
    mcq: 'Quick Check',
    type_in: 'Type the Word',
    timed_mcq: 'Speed Round',
    tap_order: 'Build the Phrase',
    flip_recall: 'Memory Flip',
    emoji: 'Read the Tone',
    match_pairs: 'Match Meaning',
    highlight_error: 'Spot Error',
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

    // Assign interaction type on mount based on AI format + some randomness for variety
    const interactionType = useMemo<InteractionType>(() => {
        if (aiFormat === 'tone_read') return 'emoji';
        if (aiFormat === 'spot_error') return 'highlight_error';
        if (aiFormat === 'best_response') return 'mcq';
        if (aiFormat === 'true_false') return 'mcq';
        
        // For 'fill_blank' or generic, randomly assign one of the active formats
        // so standard questions feel constantly fresh
        const activeFormats: InteractionType[] = ['mcq', 'type_in', 'timed_mcq', 'tap_order', 'flip_recall'];
        return activeFormats[Math.floor(Math.random() * activeFormats.length)];
    }, [aiFormat]);

    const formatLabel = FORMAT_LABELS[interactionType];

    const handleAnswer = (index: number, bonusTargetXp?: number) => {
        onAnswer(index, bonusTargetXp);
    };

    // Render the specific interaction
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
            className="w-full h-[280px] bg-neutral-950 text-white flex flex-col overflow-hidden relative"
            style={{
                boxShadow: '0 8px 30px -5px rgba(0,0,0,0.3)',
            }}
        >
            {/* Subtle gradient overlay */}
            <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 30% 0%, rgba(251,191,36,0.6) 0%, transparent 60%)',
                }}
            />

            {/* Top Bar */}
            <div className="flex items-center justify-between px-8 md:px-12 pt-4 pb-1 relative z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-400">
                        {formatLabel}
                    </span>
                </div>
                {emotion && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">
                        {emotion}
                    </span>
                )}
            </div>

            {/* Content Area - Scrollable if needed, but interactions handle their own height */}
            <div className="flex-1 px-8 md:px-12 py-2 overflow-y-auto relative z-10 custom-scrollbar flex flex-col justify-center">
                {/* Scenario text is hidden for Flip/Match as they use the full area, shown for others */}
                {interactionType !== 'flip_recall' && interactionType !== 'match_pairs' && (
                    <p
                        className="text-[14px] leading-[1.75] text-neutral-300 line-clamp-3 shrink-0"
                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                    >
                        {question.scenario}
                    </p>
                )}

                {/* The dynamic interactive component */}
                {renderInteraction()}
            </div>

            {/* Bottom Bar — feedback or skip */}
            <div className="flex items-center justify-between px-8 md:px-12 py-3 border-t border-neutral-800 relative z-10 shrink-0 bg-neutral-950/90">
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
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    <span className="text-[12px] font-medium text-emerald-400">
                                        Nailed it
                                    </span>
                                    {xpEarned > 0 && (
                                        <span className="text-[11px] font-bold text-amber-400 ml-1">
                                            +{xpEarned} XP
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    <span className="text-[12px] text-neutral-400 truncate">
                                        {question.explanation || 'Not quite'}
                                    </span>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.span
                            key="phrase"
                            className="text-[11px] text-neutral-600 italic truncate"
                        >
                            "{question.phrase}"
                        </motion.span>
                    )}
                </AnimatePresence>

                {!hasAnswered && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSkip(); }}
                        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500 hover:text-white transition-colors flex-shrink-0 ml-4 py-1"
                    >
                        Skip →
                    </button>
                )}
            </div>
        </div>
    );
}
