'use client';

/**
 * AnnotatedTranscript - Color-coded transcript display
 * Shows pronunciation, grammar, and collocation issues inline
 */

import { AnnotatedWord } from '@/lib/speaking-feedback';
import { cn } from '@/lib/utils';

interface AnnotatedTranscriptProps {
    words: AnnotatedWord[];
    className?: string;
}

export function AnnotatedTranscript({ words, className }: AnnotatedTranscriptProps) {
    if (words.length === 0) return null;

    return (
        <div className={cn('space-y-2', className)}>
            <h4 className="text-sm font-medium text-slate-600">Your Response</h4>

            <div className="p-4 bg-white rounded-lg border border-slate-200">
                <p className="text-lg leading-relaxed">
                    {words.map((word, index) => (
                        <WordSpan key={index} word={word} />
                    ))}
                </p>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />
                    Correct
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                    Pronunciation
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
                    Grammar
                </span>
            </div>
        </div>
    );
}

function WordSpan({ word }: { word: AnnotatedWord }) {
    const statusStyles = {
        correct: 'text-slate-800',
        pronunciation: 'bg-amber-100 text-amber-800 px-1 rounded border-b-2 border-amber-400',
        grammar: 'bg-red-100 text-red-800 px-1 rounded border-b-2 border-red-400',
        collocation: 'bg-purple-100 text-purple-800 px-1 rounded border-b-2 border-purple-400'
    };

    return (
        <span className="relative inline-block group">
            <span className={cn(statusStyles[word.status])}>
                {word.text}
            </span>
            {word.annotation && (
                <span className="absolute -bottom-5 left-0 text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {word.annotation}
                </span>
            )}
            <span className="mx-0.5" />
        </span>
    );
}
