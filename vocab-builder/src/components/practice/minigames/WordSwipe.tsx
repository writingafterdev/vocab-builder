'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SavedPhrase } from '@/lib/db/types';

interface WordSwipeProps {
    phrases: SavedPhrase[];
    onCorrect: (phraseId: string) => void;
    onIncorrect: (phraseId: string) => void;
    onComplete: () => void;
}

interface SwipeCard {
    id: string;
    phraseId: string;
    phrase: string;
    meaning: string;
    isCorrectMeaning: boolean;
}

function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function SwipeCardItem({
    card,
    exitDirection,
    onSwipe
}: {
    card: SwipeCard;
    exitDirection: 'left' | 'right' | null;
    onSwipe: (direction: 'left' | 'right') => void;
}) {
    const [offsetX, setOffsetX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const touchStartX = useRef<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        touchStartX.current = e.clientX;
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (touchStartX.current === null || !isDragging) return;
        setOffsetX(e.clientX - touchStartX.current);
    };

    const handlePointerUp = () => {
        if (touchStartX.current === null) return;
        setIsDragging(false);

        if (offsetX > 80) {
            onSwipe('right');
        } else if (offsetX < -80) {
            onSwipe('left');
        }

        touchStartX.current = null;
        setOffsetX(0);
    };

    const rotation = offsetX * 0.08;
    const rightOpacity = Math.max(0, Math.min(1, offsetX / 60));
    const leftOpacity = Math.max(0, Math.min(1, -offsetX / 60));

    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{
                opacity: 0,
                x: exitDirection === 'right' ? 250 : exitDirection === 'left' ? -250 : 0,
                rotate: exitDirection === 'right' ? 15 : exitDirection === 'left' ? -15 : 0,
                transition: { duration: 0.3 }
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
                transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
                touchAction: 'none',
            }}
            className="absolute w-full h-full bg-white rounded-3xl shadow-xl border border-neutral-100 p-6 flex flex-col justify-center items-center text-center select-none cursor-grab active:cursor-grabbing"
        >
            <span className="text-3xl font-bold text-neutral-900 mb-6">{card.phrase}</span>
            <div className="w-12 h-1 bg-neutral-100 rounded-full mb-6"></div>
            <span className="text-lg text-neutral-600 leading-snug">{card.meaning}</span>

            {/* YES indicator */}
            <div
                className="absolute top-4 right-4 border-2 border-green-500 text-green-500 font-bold px-3 py-1.5 rounded-lg rotate-12 text-sm"
                style={{ opacity: rightOpacity }}
            >
                CORRECT ✓
            </div>
            {/* NO indicator */}
            <div
                className="absolute top-4 left-4 border-2 border-red-500 text-red-500 font-bold px-3 py-1.5 rounded-lg -rotate-12 text-sm"
                style={{ opacity: leftOpacity }}
            >
                WRONG ✕
            </div>
        </motion.div>
    );
}

export default function WordSwipe({ phrases, onCorrect, onIncorrect, onComplete }: WordSwipeProps) {
    const [queue, setQueue] = useState<SwipeCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

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

        if (phrases.length === 0) {
            onCompleteRef.current();
            return;
        }

        const deck = shuffle(phrases).slice(0, Math.min(5, phrases.length));
        const allMeanings = phrases.map(p => p.meaning);

        const buildQueue: SwipeCard[] = deck.map((p, i) => {
            const isCorrect = Math.random() > 0.5;
            let displayMeaning = p.meaning;

            if (!isCorrect && allMeanings.length > 1) {
                const distractors = allMeanings.filter(m => m !== p.meaning);
                if (distractors.length > 0) {
                    displayMeaning = distractors[Math.floor(Math.random() * distractors.length)];
                }
            }

            return {
                id: `card-${i}-${Date.now()}`,
                phraseId: p.id,
                phrase: p.phrase,
                meaning: displayMeaning,
                isCorrectMeaning: displayMeaning === p.meaning
            };
        });

        setQueue(buildQueue);
        setCurrentIndex(0);
    }, [phrases]);

    const isProcessingRef = useRef(false);

    const handleSwipe = useCallback((direction: 'left' | 'right') => {
        if (isProcessingRef.current) return;
        if (currentIndex >= queue.length) return;
        isProcessingRef.current = true;

        const card = queue[currentIndex];
        const userSaidYes = direction === 'right';
        const actuallyMatches = card.isCorrectMeaning;

        setExitDirection(direction);

        if (userSaidYes === actuallyMatches) {
            onCorrectRef.current(card.phraseId);
        } else {
            onIncorrectRef.current(card.phraseId);
        }

        // Let exit animation play before advancing
        setTimeout(() => {
            if (currentIndex + 1 >= queue.length) {
                onCompleteRef.current();
            } else {
                setCurrentIndex(prev => prev + 1);
                setExitDirection(null);
            }
            isProcessingRef.current = false;
        }, 300);
    }, [currentIndex, queue]);

    if (queue.length === 0 || currentIndex >= queue.length) return <div className="w-full flex-1 min-h-[300px]" />;

    const currentCard = queue[currentIndex];

    return (
        <div className="w-full flex flex-col items-center justify-center flex-1">
            <h3 className="text-xl font-bold font-serif mb-2 text-center">Match?</h3>
            <p className="text-sm text-neutral-500 mb-8 text-center px-4">
                Swipe <span className="text-green-600 font-bold">Right</span> if correct, <span className="text-red-600 font-bold">Left</span> if wrong.
            </p>

            <div className="relative w-64 h-80 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    <SwipeCardItem
                        key={currentCard.id}
                        card={currentCard}
                        exitDirection={exitDirection}
                        onSwipe={handleSwipe}
                    />
                </AnimatePresence>
            </div>

            {/* Fallback Buttons */}
            <div className="flex gap-4 mt-12 w-full max-w-xs justify-between px-4">
                <button
                    onClick={() => handleSwipe('left')}
                    className="w-16 h-16 rounded-full bg-red-50 text-red-500 border-2 border-red-200 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-all shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
                <button
                    onClick={() => handleSwipe('right')}
                    className="w-16 h-16 rounded-full bg-green-50 text-green-500 border-2 border-green-200 flex items-center justify-center hover:bg-green-100 active:scale-95 transition-all shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </button>
            </div>
        </div>
    );
}
