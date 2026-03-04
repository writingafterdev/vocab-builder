'use client';

import { useState, useEffect, useRef } from 'react';
import { Reorder, motion } from 'framer-motion';
import type { SavedPhrase } from '@/lib/db/types';

interface ContextConstructorProps {
    phrases: SavedPhrase[];
    onCorrect: (phraseId: string) => void;
    onIncorrect: (phraseId: string) => void;
    onComplete: () => void;
}

interface Block {
    id: string;
    text: string;
    correctIndex: number;
}

interface ConstructorQuestion {
    id: string;
    phraseId: string;
    originalContext: string;
    blocks: Block[];
}

function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function chunkSentence(sentence: string): string[] {
    const words = sentence.split(' ');
    if (words.length <= 4) return words;

    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);
        if (currentChunk.length >= 3 || i === words.length - 1) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
        }
    }

    return chunks;
}

export default function ContextConstructor({ phrases, onCorrect, onIncorrect, onComplete }: ContextConstructorProps) {
    const [queue, setQueue] = useState<ConstructorQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentOrder, setCurrentOrder] = useState<Block[]>([]);
    const [status, setStatus] = useState<'playing' | 'correct' | 'incorrect'>('playing');

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

        const validPhrases = phrases.filter(p => p.context && p.context.trim().split(' ').length > 3);

        if (validPhrases.length === 0) {
            setTimeout(() => onCompleteRef.current(), 0);
            return;
        }

        const deck = shuffle(validPhrases).slice(0, Math.min(2, validPhrases.length));

        const buildQueue: ConstructorQuestion[] = deck.map((p, i) => {
            const rawChunks = chunkSentence(p.context);
            const blocks: Block[] = rawChunks.map((c, idx) => ({
                id: `blk-${i}-${idx}-${Date.now()}`,
                text: c,
                correctIndex: idx
            }));

            let scrambled = shuffle(blocks);
            while (scrambled.length > 1 && scrambled.every((b, idx) => b.correctIndex === idx)) {
                scrambled = shuffle(blocks);
            }

            return {
                id: `constr-${i}-${Date.now()}`,
                phraseId: p.id,
                originalContext: p.context,
                blocks: scrambled
            };
        });

        setQueue(buildQueue);
        setCurrentIndex(0);
        setCurrentOrder(buildQueue[0]?.blocks || []);
        setStatus('playing');
    }, [phrases]); // No onComplete in deps!

    const handleCheck = () => {
        if (status !== 'playing') return;

        const currentQ = queue[currentIndex];
        const isCorrect = currentOrder.every((block, idx) => block.correctIndex === idx);

        if (isCorrect) {
            setStatus('correct');
            onCorrectRef.current(currentQ.phraseId);

            setTimeout(() => {
                if (currentIndex + 1 >= queue.length) {
                    onCompleteRef.current();
                } else {
                    const nextQ = queue[currentIndex + 1];
                    setCurrentIndex(prev => prev + 1);
                    setCurrentOrder(nextQ.blocks);
                    setStatus('playing');
                }
            }, 800);
        } else {
            setStatus('incorrect');
            onIncorrectRef.current(currentQ.phraseId);

            setTimeout(() => {
                setStatus('playing');
            }, 800);
        }
    };

    if (queue.length === 0 || currentIndex >= queue.length) return <div className="w-full flex-1 min-h-[300px]" />;

    const currentQ = queue[currentIndex];

    return (
        <div className="w-full max-w-lg mx-auto flex flex-col items-center">
            <h3 className="text-xl font-bold font-serif mb-2 text-center">Rebuild Context</h3>
            <p className="text-sm text-neutral-500 mb-8 text-center px-4">
                Drag the blocks to reconstruct the original sentence.
            </p>

            <motion.div
                key={currentQ.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
            >
                <div className="bg-neutral-50/50 p-4 rounded-3xl min-h-[300px] flex flex-col justify-between border border-neutral-100 shadow-inner">
                    <Reorder.Group
                        axis="y"
                        values={currentOrder}
                        onReorder={(newOrder) => {
                            if (status === 'playing') setCurrentOrder(newOrder);
                        }}
                        className="flex flex-col gap-3 w-full"
                    >
                        {currentOrder.map((block) => (
                            <Reorder.Item
                                key={block.id}
                                value={block}
                                className={`
                                    bg-white px-5 py-4 rounded-2xl shadow-sm border border-neutral-200 
                                    text-neutral-800 font-serif leading-relaxed text-lg cursor-grab active:cursor-grabbing
                                    transition-colors
                                    ${status === 'correct' ? 'border-green-400 bg-green-50 text-green-800' : ''}
                                    ${status === 'incorrect' ? 'border-red-400 bg-red-50 text-red-800' : ''}
                                `}
                                dragListener={status === 'playing'}
                            >
                                {block.text}
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>

                    <div className="mt-8">
                        <button
                            onClick={handleCheck}
                            disabled={status !== 'playing'}
                            className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-sm
                                ${status === 'playing' ? 'bg-orange-500 hover:bg-orange-600' : ''}
                                ${status === 'correct' ? 'bg-green-500' : ''}
                                ${status === 'incorrect' ? 'bg-red-500' : ''}
                            `}
                        >
                            {status === 'playing' ? 'Check Order' : status === 'correct' ? 'Correct!' : 'Try Again'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
