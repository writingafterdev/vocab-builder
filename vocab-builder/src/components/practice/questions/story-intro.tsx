'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StoryIntroContent, ExerciseStoryContext, StorySegment } from '@/lib/db/types';

interface Props {
    question: {
        content: StoryIntroContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

export default function StoryIntroQuestion({ question, storyContext, onAnswer }: Props) {
    const { content } = question;

    const allSegments = content.segments || parseNarrativeToSegments(content.narrative || '');

    const [visibleCount, setVisibleCount] = useState(1);
    const scrollEndRef = useRef<HTMLDivElement>(null);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (scrollEndRef.current) {
            scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [visibleCount]);

    const handleNext = () => {
        if (visibleCount < allSegments.length) {
            setVisibleCount(prev => prev + 1);
        } else {
            setIsComplete(true);
            onAnswer('complete', true, 0);
        }
    };

    const isLastSegment = visibleCount >= allSegments.length;

    return (
        <div className="h-full flex flex-col bg-white relative font-sans">
            {/* Minimal Header */}
            <header className="px-6 py-8">
                <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-2">
                        {content.setting || 'Conversation'}
                    </span>
                    <h2 className="text-3xl md:text-4xl font-serif text-neutral-900">
                        {content.title || 'Story Mode'}
                    </h2>
                </div>
            </header>

            {/* Scrollable Story Content */}
            <div className="flex-1 overflow-y-auto px-6">
                <div className="max-w-5xl mx-auto pb-32 pt-4 space-y-8">
                    {allSegments.slice(0, visibleCount).map((segment, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="w-full"
                        >
                            {segment.type === 'narration' ? (
                                <div className="my-6 px-4">
                                    <p className="text-base font-serif text-neutral-500 italic leading-relaxed text-center">
                                        {segment.text}
                                    </p>
                                </div>
                            ) : (
                                <div className={cn(
                                    'border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-5',
                                    index % 2 === 0 ? 'mr-auto max-w-[85%]' : 'ml-auto max-w-[85%]'
                                )}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                                            {segment.speaker}
                                        </span>
                                        {segment.speakerRole && (
                                            <>
                                                <span className="text-neutral-200">·</span>
                                                <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-300">
                                                    {segment.speakerRole}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <p className="text-base font-serif text-neutral-800 leading-relaxed">
                                        &ldquo;{segment.text}&rdquo;
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    ))}
                    <div ref={scrollEndRef} />
                </div>
            </div>

            {/* Continue Button */}
            <div className="fixed bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
                <div className="pointer-events-auto">
                    <button
                        onClick={handleNext}
                        className={cn(
                            "px-8 py-3 text-xs font-semibold uppercase tracking-[0.1em] transition-all flex items-center gap-2",
                            isLastSegment
                                ? "bg-neutral-900 text-white hover:bg-neutral-800"
                                : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400"
                        )}
                    >
                        {isLastSegment ? (
                            <>
                                Continue
                                <Check className="w-3.5 h-3.5" />
                            </>
                        ) : (
                            <>
                                Next
                                <ArrowDown className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />
        </div>
    );
}

function parseNarrativeToSegments(text: string): StorySegment[] {
    const paragraphs = text.split('\n\n').filter(Boolean);
    return paragraphs.map(p => {
        const match = p.match(/^([A-Za-z\s]+):\s*(.+)/);
        if (match) {
            return {
                type: 'dialogue',
                speaker: match[1].trim(),
                text: match[2].trim()
            };
        }
        return {
            type: 'narration',
            text: p
        };
    });
}
