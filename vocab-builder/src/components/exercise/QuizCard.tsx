'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Zap, Sparkles, Target, Brain, Lightbulb, Eye, MessageCircle, Volume2, Play } from 'lucide-react';
import type { InlineQuestion } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { useTTS } from '@/hooks/use-tts';

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

// Map the AI question types to our interaction types.
type InteractionType = 'mcq' | 'type_in' | 'timed_mcq' | 'tap_order' | 'flip_recall' | 'emoji' | 'match_pairs' | 'highlight_error';

const FORMAT_CONFIG: Record<InteractionType, { label: string; accent: string; icon: typeof Zap }> = {
    mcq: { label: 'Quick Check', accent: 'text-blue-500', icon: Target },
    type_in: { label: 'Type It', accent: 'text-violet-500', icon: MessageCircle },
    timed_mcq: { label: 'Speed Round', accent: 'text-red-500', icon: Zap },
    tap_order: { label: 'Sort It', accent: 'text-emerald-500', icon: Sparkles },
    flip_recall: { label: 'Memory Flip', accent: 'text-amber-500', icon: Brain },
    emoji: { label: 'Read the Tone', accent: 'text-pink-500', icon: Eye },
    match_pairs: { label: 'Compare', accent: 'text-teal-500', icon: Lightbulb },
    highlight_error: { label: 'Spot Error', accent: 'text-orange-500', icon: Target },
};

// Map 15 question types → base interaction component
const QUESTION_TYPE_TO_INTERACTION: Record<string, InteractionType> = {
    // Recognition (MCQ-based)
    social_consequence_prediction: 'mcq',
    situation_phrase_matching: 'mcq',
    tone_interpretation: 'emoji',
    contrast_exposure: 'match_pairs',
    // Comprehension (MCQ-based + special)
    fill_gap_mcq: 'mcq',
    why_did_they_say: 'mcq',
    error_detection: 'highlight_error',
    appropriateness_judgment: 'mcq',
    register_sorting: 'tap_order',
    reading_comprehension: 'mcq',
    sentence_correction: 'mcq',
    // Guided production (type-in)
    constrained_production: 'type_in',
    transformation_exercise: 'type_in',
    dialogue_completion_open: 'type_in',
    text_completion: 'type_in',
    // Listening
    listen_and_identify: 'mcq',
    tone_by_voice: 'emoji',
    dictation: 'type_in',
};

// Labels per question type (overrides the generic FORMAT_CONFIG label)
const QUESTION_TYPE_LABELS: Record<string, string> = {
    social_consequence_prediction: 'What Happens Next?',
    situation_phrase_matching: 'Which Phrase Fits?',
    tone_interpretation: 'Read the Tone',
    contrast_exposure: 'Spot the Difference',
    fill_gap_mcq: 'Fill the Gap',
    why_did_they_say: 'Why Did They Say It?',
    error_detection: 'Spot the Error',
    appropriateness_judgment: 'Right or Wrong?',
    register_sorting: 'Sort by Register',
    reading_comprehension: 'Comprehension',
    sentence_correction: 'Fix It',
    constrained_production: 'Type the Word',
    transformation_exercise: 'Rewrite It',
    dialogue_completion_open: 'Complete the Line',
    text_completion: 'Fill It In',
    listen_and_identify: 'Listen & Identify',
    tone_by_voice: 'Listen to the Tone',
    dictation: 'Dictation',
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
    const questionType = (question as any).questionType || (question as any).format || 'fill_gap_mcq';

    const isListeningType = questionType === 'listen_and_identify' || questionType === 'tone_by_voice' || questionType === 'dictation';
    const [audioPlayedState, setAudioPlayedState] = useState(false);
    // Auto-play trigger flag so we only auto-play once when the card mounts
    const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
    
    // We reveal the UI immediately if it's not a listening type, or if we've successfully played the audio.
    const isUIRevealed = !isListeningType || audioPlayedState || hasAnswered;

    const { play, isPlaying, isLoading, stop } = useTTS();

    useEffect(() => {
        if (isListeningType && !hasAutoPlayed) {
            setHasAutoPlayed(true);
            const playAudio = async () => {
                const completed = await play(question.scenario, 'eve');
                if (completed) setAudioPlayedState(true);
            };
            playAudio();
        }
    }, [isListeningType, hasAutoPlayed, play, question.scenario]);

    const interactionType = useMemo<InteractionType>(() => {
        // Map questionType to base interaction
        let base = QUESTION_TYPE_TO_INTERACTION[questionType] || 'mcq';

        // For MCQ-based types, add variety: 20% timed, 10% flip recall (skip for listening types so we don't mess up timing)
        if (base === 'mcq' && !isListeningType) {
            const roll = Math.random();
            if (roll < 0.1) base = 'flip_recall';
            else if (roll < 0.3) base = 'timed_mcq';
        }

        return base;
    }, [questionType]);

    const config = FORMAT_CONFIG[interactionType];
    const label = QUESTION_TYPE_LABELS[questionType] || config.label;
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
                        {label}
                    </span>
                </div>
                {emotion && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-400 font-medium">
                        {emotion}
                    </span>
                )}
            </div>

            <div className="flex-1 px-8 md:px-12 py-2 overflow-y-auto relative z-10 custom-scrollbar flex flex-col justify-center">
                {isListeningType && !isUIRevealed ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <button
                            onClick={async () => {
                                const completed = await play(question.scenario, 'eve');
                                if (completed) setAudioPlayedState(true);
                            }}
                            disabled={isLoading || isPlaying}
                            className={cn(
                                "w-16 h-16 rounded-full flex items-center justify-center transition-all",
                                isPlaying || isLoading ? "bg-violet-100 text-violet-500" : "bg-neutral-900 text-white hover:bg-neutral-800 hover:scale-105 active:scale-95",
                                isLoading && "animate-pulse"
                            )}
                        >
                            {isPlaying ? (
                                <div className="flex gap-1 items-end h-5">
                                    <span className="w-1 bg-current h-2 animate-[bounce_1s_infinite]" />
                                    <span className="w-1 bg-current h-4 animate-[bounce_1s_infinite_0.2s]" />
                                    <span className="w-1 bg-current h-3 animate-[bounce_1s_infinite_0.4s]" />
                                </div>
                            ) : (
                                <Play className="w-6 h-6 ml-1" fill="currentColor" />
                            )}
                        </button>
                        <span className="text-xs text-neutral-400 font-medium tracking-wide">
                            {isLoading ? 'GENERATING AUDIO...' : isPlaying ? 'LISTENING...' : 'TAP TO LISTEN'}
                        </span>
                    </div>
                ) : (
                    <>
                        {interactionType !== 'flip_recall' && interactionType !== 'match_pairs' && (
                            <div className="mb-4 relative group">
                                <p
                                    className="text-[14px] leading-[1.75] text-neutral-600 line-clamp-3 shrink-0"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    {question.scenario}
                                </p>
                                {isListeningType && (
                                    <button
                                        onClick={() => play(question.scenario, 'eve')}
                                        disabled={isLoading || isPlaying}
                                        className="absolute -right-3 -top-3 p-2 text-neutral-400 hover:text-violet-500 bg-white rounded-full shadow-sm border border-neutral-100 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Volume2 className={cn("w-3.5 h-3.5", (isPlaying || isLoading) && "text-violet-500 animate-pulse")} />
                                    </button>
                                )}
                            </div>
                        )}

                        {renderInteraction()}
                    </>
                )}
            </div>

            {/* Bottom Bar */}
            <div className={cn("flex items-center justify-between px-8 md:px-12 py-3 border-t border-neutral-100 relative z-10 shrink-0 bg-white/90 transition-opacity", !isUIRevealed && "opacity-0 pointer-events-none")}>
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
