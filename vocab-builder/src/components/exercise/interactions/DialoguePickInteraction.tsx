'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface DialoguePickInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function DialoguePickInteraction({ question, onAnswer, disabled }: DialoguePickInteractionProps) {
    const turns = question.dialogueTurns || [];
    const options = question.responseOptions || question.options || [];
    const correctIndex = question.correctResponseIndex ?? question.correctIndex ?? 0;
    const [selected, setSelected] = useState<number | null>(null);

    const handleSelect = useCallback((index: number) => {
        if (disabled || selected !== null) return;
        const correct = index === correctIndex;
        setSelected(index);

        setTimeout(() => {
            onAnswer(index, correct);
        }, 600);
    }, [disabled, selected, correctIndex, onAnswer]);

    return (
        <div className="space-y-5">
            {/* Chat thread */}
            <div className="space-y-2 max-w-md mx-auto">
                {turns.map((turn, i) => {
                    const isLeft = i % 2 === 0;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.12, duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                            className={`flex ${isLeft ? 'justify-start' : 'justify-end'}`}
                        >
                            <div
                                className={`
                                    max-w-[80%] px-4 py-2.5 text-sm leading-relaxed
                                    ${isLeft
                                        ? 'bg-neutral-100 text-neutral-800 rounded-tl-sm rounded-tr-2xl rounded-br-2xl rounded-bl-2xl'
                                        : 'bg-neutral-800 text-neutral-100 rounded-tl-2xl rounded-tr-sm rounded-br-2xl rounded-bl-2xl'
                                    }
                                `}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-0.5">
                                    {turn.speaker}
                                </span>
                                {turn.text}
                            </div>
                        </motion.div>
                    );
                })}

                {/* "Your turn" indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: turns.length * 0.12, duration: 0.3 }}
                    className="flex justify-end"
                >
                    <div className="px-4 py-2 text-sm text-neutral-300 italic">
                        Your turn...
                    </div>
                </motion.div>
            </div>

            {/* Response options */}
            <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                    Pick the best response
                </span>
                {options.map((option, i) => {
                    const isSelected = selected === i;
                    const isCorrectOption = i === correctIndex;
                    const showResult = selected !== null;

                    return (
                        <motion.button
                            key={i}
                            onClick={() => handleSelect(i)}
                            disabled={disabled || selected !== null}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{
                                opacity: showResult && !isSelected && !isCorrectOption ? 0.4 : 1,
                                y: 0,
                            }}
                            transition={{
                                delay: (turns.length * 0.12) + (i * 0.06),
                                duration: 0.3,
                                ease: [0.25, 1, 0.5, 1],
                            }}
                            className={`
                                w-full text-left px-4 py-3 text-sm
                                border transition-all duration-200
                                min-h-[44px]
                                ${showResult
                                    ? isSelected && isCorrectOption
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                        : isSelected && !isCorrectOption
                                            ? 'bg-red-50 border-red-300 text-red-600'
                                            : isCorrectOption
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                : 'bg-white border-neutral-200 text-neutral-400'
                                    : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400 active:bg-neutral-50'
                                }
                            `}
                        >
                            &ldquo;{option}&rdquo;
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
