'use client';

import { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import { GripVertical, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExerciseStoryContext } from '@/lib/db/types';

interface RegisterSortingContent {
    phrases: string[];
    correctOrder: number[];
    registers?: string[];
}

interface Props {
    question: {
        content: RegisterSortingContent;
    };
    storyContext: ExerciseStoryContext;
    onAnswer: (answer: string, correct: boolean, timeTaken: number) => void;
    disabled?: boolean;
}

interface SortablePhrase {
    id: number;
    phrase: string;
}

export default function RegisterSortingQuestion({ question, storyContext, onAnswer, disabled }: Props) {
    const content = question.content;
    const [startTime] = useState(Date.now());
    const [submitted, setSubmitted] = useState(false);

    const initialPhrases: SortablePhrase[] = content.phrases.map((phrase, i) => ({
        id: i,
        phrase,
    }));
    const [items, setItems] = useState<SortablePhrase[]>(initialPhrases);

    const correctOrder = content.correctOrder || [];

    const handleSubmit = () => {
        if (disabled || submitted) return;

        setSubmitted(true);
        const userOrder = items.map(item => item.id);
        const isCorrect = JSON.stringify(userOrder) === JSON.stringify(correctOrder);
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        setTimeout(() => {
            onAnswer(userOrder.join(','), isCorrect, timeTaken);
        }, 1000);
    };

    const isCorrectPosition = (index: number, itemId: number): boolean => {
        return correctOrder[index] === itemId;
    };

    return (
        <div className="h-full flex flex-col py-8 font-sans">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 leading-tight mb-2">
                    Sort by formality
                </h1>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    Drag from most casual to most formal
                </p>
            </div>

            {/* Scale Labels */}
            <div className="flex justify-between mb-4 px-1">
                <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                    Casual
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                    Formal
                </span>
            </div>

            {/* Sortable List */}
            <div className="border border-neutral-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.04)] p-3 mb-6">
                <Reorder.Group
                    axis="y"
                    values={items}
                    onReorder={setItems}
                    className="space-y-2"
                >
                    {items.map((item, index) => (
                        <Reorder.Item
                            key={item.id}
                            value={item}
                            drag={!(disabled || submitted)}
                            className={cn(
                                "bg-white border p-4 cursor-grab active:cursor-grabbing flex items-center gap-3 transition-all",
                                submitted
                                    ? isCorrectPosition(index, item.id)
                                        ? 'border-neutral-900 bg-neutral-50'
                                        : 'border-neutral-300 bg-neutral-100'
                                    : 'border-neutral-200 hover:border-neutral-400'
                            )}
                        >
                            <GripVertical className="w-4 h-4 text-neutral-300 shrink-0" />
                            <span className="text-sm text-neutral-700 flex-1">
                                &ldquo;{item.phrase}&rdquo;
                            </span>
                            {submitted && (
                                isCorrectPosition(index, item.id) ? (
                                    <Check className="w-4 h-4 text-neutral-900" />
                                ) : (
                                    <span className="text-[10px] text-neutral-400 font-medium">
                                        →{correctOrder.indexOf(item.id) + 1}
                                    </span>
                                )
                            )}
                        </Reorder.Item>
                    ))}
                </Reorder.Group>
            </div>

            {/* Submit Button */}
            {!submitted && (
                <button
                    onClick={handleSubmit}
                    disabled={disabled}
                    className="w-full py-3.5 bg-neutral-900 text-white text-sm font-semibold uppercase tracking-[0.1em] hover:bg-neutral-800 transition-colors mt-auto"
                >
                    Check Order
                </button>
            )}

            {/* Result */}
            {submitted && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-neutral-200 p-4 text-center"
                >
                    <p className="text-sm text-neutral-600">
                        {JSON.stringify(items.map(i => i.id)) === JSON.stringify(correctOrder)
                            ? 'Perfect order'
                            : 'Check the correct positions above'}
                    </p>
                </motion.div>
            )}
        </div>
    );
}
