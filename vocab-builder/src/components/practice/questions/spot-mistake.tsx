'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpotMistakeContent, ExerciseStoryContext } from '@/lib/db/types';

interface Props {
    question: {
        content: SpotMistakeContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

interface TextSegment {
    text: string;
    isMistake: boolean;
    index: number;
}

export default function SpotMistakeQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [startTime] = useState(Date.now());
    const [submitted, setSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    const options = content.options || (content as any).choices || (content as any).answers || [];
    const correctIndex = content.correctIndex ?? (content as any).correctAnswer ?? 0;
    const sentence = content.sentence || (content as any).text || (content as any).mistakeSentence || 'The sentence with a mistake.';
    const wrongPhrase = content.wrongWord || (content as any).mistake || (content as any).incorrectWord || 'mistake';

    const segments = useMemo<TextSegment[]>(() => {
        const normalizedWrong = wrongPhrase.replace(/['"]/g, '').trim().toLowerCase();
        const normalizedSentence = sentence.toLowerCase();
        const mistakeStart = normalizedSentence.indexOf(normalizedWrong);

        if (mistakeStart === -1) {
            return sentence.split(' ').map((word: string, i: number) => ({
                text: word,
                isMistake: word.replace(/[.,!?'"]/g, '').toLowerCase() === normalizedWrong.split(' ')[0],
                index: i
            }));
        }

        const mistakeEnd = mistakeStart + normalizedWrong.length;
        const result: TextSegment[] = [];
        let segmentIndex = 0;

        const beforeText = sentence.substring(0, mistakeStart).trim();
        if (beforeText) {
            beforeText.split(' ').filter((w: string) => w).forEach((word: string) => {
                result.push({ text: word, isMistake: false, index: segmentIndex++ });
            });
        }

        const mistakeText = sentence.substring(mistakeStart, mistakeEnd).trim();
        if (mistakeText) {
            result.push({ text: mistakeText, isMistake: true, index: segmentIndex++ });
        }

        const afterText = sentence.substring(mistakeEnd).trim();
        if (afterText) {
            afterText.split(' ').filter((w: string) => w).forEach((word: string) => {
                result.push({ text: word, isMistake: false, index: segmentIndex++ });
            });
        }

        return result;
    }, [sentence, wrongPhrase]);

    const mistakeIndices = useMemo(
        () => new Set(segments.filter(s => s.isMistake).map(s => s.index)),
        [segments]
    );

    const toggleSegment = (segment: TextSegment) => {
        if (disabled || submitted) return;

        setSelectedIndices(prev => {
            const next = new Set(prev);
            if (next.has(segment.index)) {
                next.delete(segment.index);
            } else {
                next.add(segment.index);
            }
            return next;
        });
    };

    const handleCheck = () => {
        if (selectedIndices.size === 0 || submitted) return;

        setSubmitted(true);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        // Check if ALL selected words are mistakes and ALL mistakes are selected
        const allMistakesFound = [...mistakeIndices].every(i => selectedIndices.has(i));
        const noFalsePositives = [...selectedIndices].every(i => mistakeIndices.has(i));
        const correct = allMistakesFound && noFalsePositives;

        setIsCorrect(correct);

        setTimeout(() => {
            onAnswer(
                correct ? options[correctIndex] : [...selectedIndices].map(i => segments[i]?.text).join(' '),
                correct,
                timeTaken
            );
        }, 1800);
    };

    const getSegmentStyle = (segment: TextSegment) => {
        const isSelected = selectedIndices.has(segment.index);

        if (!submitted) {
            // Pre-check: toggle styling
            if (isSelected) {
                return 'bg-neutral-900 text-white border-neutral-900';
            }
            return 'hover:bg-neutral-100 hover:border-neutral-300';
        }

        // Post-check: show results
        if (segment.isMistake && isSelected) {
            // Correctly identified — strikethrough + correction
            return 'bg-neutral-100 text-neutral-400 line-through border-neutral-300';
        }
        if (segment.isMistake && !isSelected) {
            // Missed mistake — highlight what they missed
            return 'bg-red-50 text-red-600 border-red-200 underline underline-offset-4';
        }
        if (!segment.isMistake && isSelected) {
            // False positive — wrong selection
            return 'bg-red-50 text-red-400 border-red-200';
        }
        // Correct non-selection
        return 'opacity-40';
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Spot the mistake
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Tap the incorrect word{mistakeIndices.size > 1 ? 's' : ''} then check
                </p>
            </div>

            {/* Sentence Card */}
            <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-8 mb-8 flex-1 flex flex-col items-center justify-center">
                <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-3 leading-loose text-lg text-neutral-700">
                    {segments.map((segment) => (
                        <motion.span
                            key={segment.index}
                            whileHover={{ scale: disabled || submitted ? 1 : 1.03 }}
                            whileTap={{ scale: disabled || submitted ? 1 : 0.97 }}
                            onClick={() => toggleSegment(segment)}
                            className={cn(
                                "cursor-pointer px-2 py-1 transition-all border border-transparent select-none",
                                getSegmentStyle(segment)
                            )}
                        >
                            {segment.text}
                        </motion.span>
                    ))}
                </div>

                {/* Correction Reveal */}
                {submitted && isCorrect && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8 border border-neutral-200 p-4 flex items-center gap-3"
                    >
                        <Check className="w-5 h-5 text-neutral-900 shrink-0" />
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">Correction</p>
                            <p className="text-base font-serif text-neutral-900">&ldquo;{options[correctIndex]}&rdquo;</p>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Check Button */}
            {!submitted && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleCheck}
                    disabled={selectedIndices.size === 0 || disabled}
                    className={cn(
                        "w-full py-3.5 text-sm font-semibold uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2",
                        selectedIndices.size > 0
                            ? "bg-neutral-900 text-white hover:bg-neutral-800"
                            : "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                    )}
                >
                    Check
                    <ArrowRight className="w-3.5 h-3.5" />
                </motion.button>
            )}
        </div>
    );
}
