'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface ErrorTapFixInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function ErrorTapFixInteraction({ question, onAnswer, disabled }: ErrorTapFixInteractionProps) {
    const segments = question.errorSegments || [];
    const errorIndex = question.errorIndex ?? -1;
    const correctFix = question.correctFix || '';

    const [tappedIndex, setTappedIndex] = useState<number | null>(null);
    const [fixText, setFixText] = useState('');
    const [wrongTap, setWrongTap] = useState<number | null>(null);
    const [result, setResult] = useState<'correct' | 'wrong_tap' | 'wrong_fix' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when error is found
    useEffect(() => {
        if (tappedIndex === errorIndex && inputRef.current) {
            inputRef.current.focus();
        }
    }, [tappedIndex, errorIndex]);

    const handleSegmentTap = useCallback((index: number) => {
        if (disabled || result) return;

        if (index === errorIndex) {
            // Correct tap — show input
            setTappedIndex(index);
            setWrongTap(null);
        } else {
            // Wrong tap — shake
            setWrongTap(index);
            setTimeout(() => setWrongTap(null), 500);
        }
    }, [disabled, result, errorIndex]);

    const handleFixSubmit = useCallback(() => {
        if (!fixText.trim() || result) return;

        const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!?;:'"]+/g, '').replace(/\s+/g, ' ');
        const correct = normalize(fixText) === normalize(correctFix);

        setResult(correct ? 'correct' : 'wrong_fix');

        setTimeout(() => {
            onAnswer(0, correct);
        }, 600);
    }, [fixText, result, correctFix, onAnswer]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFixSubmit();
        }
    }, [handleFixSubmit]);

    return (
        <div className="space-y-5">
            {/* Instruction */}
            {tappedIndex === null && (
                <p className="text-center text-[11px] text-neutral-400 uppercase tracking-wider">
                    Tap the word that&apos;s wrong
                </p>
            )}

            {/* Sentence with tappable segments */}
            <div
                className="text-[17px] leading-[2.2] text-neutral-800"
                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
            >
                {segments.map((segment, i) => {
                    const isTapped = tappedIndex === i;
                    const isError = i === errorIndex;
                    const isWrong = wrongTap === i;
                    const showInput = isTapped && isError;

                    if (showInput) {
                        return (
                            <span key={i} className="inline-block mx-0.5 align-bottom">
                                <motion.span
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: 'auto', opacity: 1 }}
                                    transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                                    className="inline-flex items-center"
                                >
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={fixText}
                                        onChange={(e) => setFixText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        disabled={disabled || !!result}
                                        placeholder={segment}
                                        className={`
                                            w-32 px-2 py-0.5 text-[17px] font-medium
                                            border-b-2 bg-transparent outline-none
                                            ${result === 'correct'
                                                ? 'border-emerald-500 text-emerald-700'
                                                : result === 'wrong_fix'
                                                    ? 'border-red-500 text-red-600'
                                                    : 'border-neutral-900 text-neutral-900'
                                            }
                                        `}
                                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                                    />
                                    {!result && fixText.trim() && (
                                        <button
                                            onClick={handleFixSubmit}
                                            className="ml-1.5 px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-neutral-900 text-white hover:bg-neutral-700 transition-colors min-h-[28px]"
                                        >
                                            Fix
                                        </button>
                                    )}
                                </motion.span>
                            </span>
                        );
                    }

                    return (
                        <motion.span
                            key={i}
                            onClick={() => handleSegmentTap(i)}
                            animate={{
                                x: isWrong ? [0, -3, 3, -2, 2, 0] : 0,
                                color: isTapped && result === 'correct'
                                    ? '#059669'
                                    : isWrong
                                        ? '#dc2626'
                                        : '#262626',
                            }}
                            transition={{ duration: 0.3 }}
                            className={`
                                inline cursor-pointer transition-all duration-200
                                hover:bg-neutral-100 px-0.5
                                ${result && isError && tappedIndex !== i ? 'underline decoration-red-300 decoration-wavy' : ''}
                            `}
                        >
                            {segment}
                            {i < segments.length - 1 ? ' ' : ''}
                        </motion.span>
                    );
                })}
            </div>

            {/* Show correct fix on wrong answer */}
            {result === 'wrong_fix' && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-neutral-500"
                >
                    <span className="font-medium text-neutral-700">Correct fix:</span>{' '}
                    <span className="text-emerald-700 font-medium">{correctFix}</span>
                </motion.div>
            )}
        </div>
    );
}
