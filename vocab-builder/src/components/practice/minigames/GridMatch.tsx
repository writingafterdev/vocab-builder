'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SavedPhrase } from '@/lib/db/types';

interface GridMatchProps {
    phrases: SavedPhrase[];
    onCorrect: (phraseId: string) => void;
    onIncorrect: (phraseId: string) => void;
    onComplete: () => void;
}

interface CardContent {
    id: string;
    phraseId: string;
    type: 'phrase' | 'meaning';
    text: string;
    matched: boolean;
}

function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export default function GridMatch({ phrases, onCorrect, onIncorrect, onComplete }: GridMatchProps) {
    const [phraseCards, setPhraseCards] = useState<CardContent[]>([]);
    const [meaningCards, setMeaningCards] = useState<CardContent[]>([]);
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [shakeIds, setShakeIds] = useState<Set<string>>(new Set());
    const [isComplete, setIsComplete] = useState(false);

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

        const selected = shuffle(phrases).slice(0, Math.min(4, phrases.length));

        // Build separate columns — phrases left, meanings right
        const leftCards: CardContent[] = selected.map((p, i) => ({
            id: `p-${i}`, phraseId: p.id, type: 'phrase' as const, text: p.phrase, matched: false
        }));
        const rightCards: CardContent[] = selected.map((p, i) => ({
            id: `m-${i}`, phraseId: p.id, type: 'meaning' as const, text: p.meaning, matched: false
        }));

        // Shuffle each column independently so they don't line up
        setPhraseCards(shuffle(leftCards));
        setMeaningCards(shuffle(rightCards));
        setIsComplete(false);
    }, [phrases]);

    // Win condition
    const allCards = [...phraseCards, ...meaningCards];
    useEffect(() => {
        if (!isComplete && allCards.length > 0 && allCards.every(c => c.matched)) {
            setIsComplete(true);
            setTimeout(() => onCompleteRef.current(), 400);
        }
    }, [phraseCards, meaningCards, isComplete, allCards]);

    const handleCardClick = (card: CardContent) => {
        if (card.matched || isComplete) return;

        if (!selectedCardId) {
            setSelectedCardId(card.id);
            return;
        }

        if (selectedCardId === card.id) {
            setSelectedCardId(null);
            return;
        }

        const firstCard = allCards.find(c => c.id === selectedCardId);
        if (!firstCard) return;

        // Must pick one from each column
        if (firstCard.type === card.type) {
            // Clicked same column — just switch selection
            setSelectedCardId(card.id);
            return;
        }

        if (firstCard.phraseId === card.phraseId) {
            // Correct match
            const updateCard = (c: CardContent) =>
                (c.id === firstCard.id || c.id === card.id) ? { ...c, matched: true } : c;
            setPhraseCards(prev => prev.map(updateCard));
            setMeaningCards(prev => prev.map(updateCard));
            onCorrectRef.current(card.phraseId);
            setSelectedCardId(null);
        } else {
            // Wrong match
            setShakeIds(new Set([firstCard.id, card.id]));
            onIncorrectRef.current(firstCard.phraseId);
            setTimeout(() => {
                setShakeIds(new Set());
                setSelectedCardId(null);
            }, 500);
        }
    };

    if (allCards.length === 0) return <div className="w-full flex-1 min-h-[300px]" />;

    const renderCard = (card: CardContent) => {
        const isSelected = selectedCardId === card.id;
        const isShaking = shakeIds.has(card.id);

        return (
            <motion.button
                key={card.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{
                    opacity: card.matched ? 0.4 : 1,
                    scale: card.matched ? 0.95 : 1,
                    x: isShaking ? [-5, 5, -5, 5, 0] : 0,
                }}
                transition={{
                    x: { duration: 0.3 },
                    opacity: { duration: 0.2 },
                    layout: { type: "spring", stiffness: 300, damping: 30 }
                }}
                onClick={() => handleCardClick(card)}
                disabled={card.matched}
                className={`
                    min-h-[80px] p-3 rounded-xl flex items-center justify-center text-center shadow-sm border-2 transition-colors
                    ${card.matched ? 'bg-green-50 border-green-400 text-green-600 pointer-events-none line-through' : ''}
                    ${!card.matched && isSelected ? 'bg-orange-50 border-orange-500 text-orange-700 ring-2 ring-orange-300' : ''}
                    ${!card.matched && !isSelected ? 'bg-card border-border hover:border-orange-300' : ''}
                    ${isShaking ? 'bg-red-50 border-red-500 text-red-700' : ''}
                `}
            >
                <span className={card.type === 'phrase' ? 'font-bold text-base' : 'text-sm text-muted-foreground leading-snug'}>
                    {card.text}
                </span>
            </motion.button>
        );
    };

    return (
        <div className="w-full max-w-lg mx-auto flex flex-col items-center">
            <h3 className="text-xl font-bold font-serif mb-2 text-center">Tap matching pairs</h3>
            <p className="text-sm text-neutral-500 mb-6 text-center">Match each phrase with its meaning</p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full px-4">
                {/* Column headers */}
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center mb-1">Phrase</p>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center mb-1">Meaning</p>

                {/* Interleave rows: phrase[i] on left, meaning[i] on right */}
                {phraseCards.map((pCard, i) => {
                    const mCard = meaningCards[i];
                    return (
                        <AnimatePresence key={`row-${i}`}>
                            {renderCard(pCard)}
                            {mCard && renderCard(mCard)}
                        </AnimatePresence>
                    );
                })}
            </div>
        </div>
    );
}
