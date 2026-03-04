'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { SavedPhrase } from '@/lib/db/types';

interface ContextClozeProps {
    phrases: SavedPhrase[];
    onCorrect: (phraseId: string) => void;
    onIncorrect: (phraseId: string) => void;
    onComplete: () => void;
}

interface ClozeQuestion {
    id: string;
    phraseId: string;
    phrase: string;
    context: string;
    options: string[];
}

function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export default function ContextCloze({ phrases, onCorrect, onIncorrect, onComplete }: ContextClozeProps) {
    const [queue, setQueue] = useState<ClozeQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    // Ref-based callbacks
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onCorrectRef = useRef(onCorrect);
    onCorrectRef.current = onCorrect;
    const onIncorrectRef = useRef(onIncorrect);
    onIncorrectRef.current = onIncorrect;

    const initializedRef = useRef(false);
    const phrasesKeyRef = useRef('');

    useEffect(() => {
        const key = phrases.map(p => p.id).sort().join(',');
        if (key === phrasesKeyRef.current && initializedRef.current) return;
        phrasesKeyRef.current = key;
        initializedRef.current = true;

        // Accept any phrase with non-empty context
        const validPhrases = phrases.filter(p => p.context && p.context.trim().length > 0);

        if (validPhrases.length === 0) {
            setTimeout(() => onCompleteRef.current(), 0);
            return;
        }

        const allAvailablePhrases = phrases.map(p => p.phrase);
        const deck = shuffle(validPhrases).slice(0, Math.min(3, validPhrases.length));

        const buildQueue: ClozeQuestion[] = deck.map((p, i) => {
            const distractors = shuffle(allAvailablePhrases.filter(phnt => phnt !== p.phrase)).slice(0, 3);
            const options = shuffle([...distractors, p.phrase]);

            // Try to mask the phrase in context; if it doesn't appear, use "______" hint style
            const escaped = p.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            const maskedContext = regex.test(p.context)
                ? p.context.replace(regex, '_________')
                : `${p.context} [Which phrase fits?]`;

            return {
                id: `cloze-${i}-${Date.now()}`,
                phraseId: p.id,
                phrase: p.phrase,
                context: maskedContext,
                options
            };
        });

        setQueue(buildQueue);
        setCurrentIndex(0);
    }, [phrases]); // No onComplete in deps!

    const handleSelect = (option: string) => {
        if (selectedOption) return;

        const currentQ = queue[currentIndex];
        setSelectedOption(option);

        const isCorrect = option === currentQ.phrase;

        if (isCorrect) {
            onCorrectRef.current(currentQ.phraseId);
        } else {
            onIncorrectRef.current(currentQ.phraseId);
        }

        setTimeout(() => {
            if (currentIndex + 1 >= queue.length) {
                onCompleteRef.current();
            } else {
                setCurrentIndex(prev => prev + 1);
                setSelectedOption(null);
            }
        }, 600);
    };

    if (queue.length === 0 || currentIndex >= queue.length) return <div className="w-full flex-1 min-h-[300px]" />;

    const currentQ = queue[currentIndex];

    return (
        <div className="w-full max-w-lg mx-auto flex flex-col items-center">
            <h3 className="text-xl font-bold font-serif mb-6 text-center">Fill the blank</h3>

            <motion.div
                key={currentQ.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
            >
                <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-2xl mb-8 relative">
                    <span className="absolute -top-3 left-6 bg-white px-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Context</span>
                    <p className="text-lg text-neutral-800 leading-relaxed font-serif italic text-center">
                        &quot;{currentQ.context}&quot;
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 w-full">
                    {currentQ.options.map((opt, i) => {
                        const isSelected = selectedOption === opt;
                        const isCorrectAnswer = opt === currentQ.phrase;

                        let stateStyles = "bg-white border-neutral-200 hover:border-orange-400 text-neutral-700";
                        if (selectedOption) {
                            if (isSelected && isCorrectAnswer) {
                                stateStyles = "bg-green-100 border-green-500 text-green-800 font-bold";
                            } else if (isSelected && !isCorrectAnswer) {
                                stateStyles = "bg-red-50 border-red-500 text-red-700";
                            } else if (!isSelected && isCorrectAnswer) {
                                stateStyles = "bg-green-50 border-green-300 text-green-700 border-dashed";
                            } else {
                                stateStyles = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-50";
                            }
                        }

                        return (
                            <button
                                key={i}
                                disabled={selectedOption !== null}
                                onClick={() => handleSelect(opt)}
                                className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${stateStyles}`}
                            >
                                <span className={selectedOption ? "" : "font-medium"}>{opt}</span>
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        </div>
    );
}
