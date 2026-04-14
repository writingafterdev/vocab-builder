'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionQuestion } from '@/lib/db/types';

interface CategorySortInteractionProps {
    question: SessionQuestion;
    onAnswer: (selectedIndex: number, correct: boolean) => void;
    disabled?: boolean;
}

export default function CategorySortInteraction({ question, onAnswer, disabled }: CategorySortInteractionProps) {
    const categories = question.categories || [];
    const items = question.categoryItems || [];
    const [placements, setPlacements] = useState<Map<number, number>>(new Map()); // itemIndex → categoryIndex
    const [selectedItem, setSelectedItem] = useState<number | null>(null);
    const [wrongFlash, setWrongFlash] = useState<number | null>(null);

    const allPlaced = placements.size === items.length;

    const handleItemTap = useCallback((index: number) => {
        if (disabled || placements.has(index)) return;
        setSelectedItem(index === selectedItem ? null : index);
    }, [disabled, placements, selectedItem]);

    const handleBinTap = useCallback((catIndex: number) => {
        if (disabled || selectedItem === null) return;

        const item = items[selectedItem];
        const correct = item.correctCategory === catIndex;

        if (correct) {
            const newPlacements = new Map(placements);
            newPlacements.set(selectedItem, catIndex);
            setPlacements(newPlacements);
            setSelectedItem(null);

            // Check if all items are placed
            if (newPlacements.size === items.length) {
                // All correct (only correct placements are stored)
                setTimeout(() => onAnswer(0, true), 600);
            }
        } else {
            setWrongFlash(selectedItem);
            setTimeout(() => {
                setWrongFlash(null);
                setSelectedItem(null);
            }, 500);
        }
    }, [disabled, selectedItem, items, placements, onAnswer]);

    // Group placed items by category
    const binContents: Map<number, number[]> = new Map();
    categories.forEach((_, i) => binContents.set(i, []));
    placements.forEach((catIdx, itemIdx) => {
        binContents.get(catIdx)?.push(itemIdx);
    });

    return (
        <div className="space-y-5">
            {/* Category bins */}
            <div className={`grid gap-3 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {categories.map((cat, i) => (
                    <motion.button
                        key={cat}
                        onClick={() => handleBinTap(i)}
                        disabled={disabled || selectedItem === null}
                        className={`
                            text-center px-3 py-3 border-2 border-dashed transition-all duration-200 min-h-[80px]
                            ${selectedItem !== null
                                ? 'border-neutral-400 bg-neutral-50 cursor-pointer hover:border-neutral-600'
                                : 'border-neutral-200 bg-white cursor-default'
                            }
                        `}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                            {cat}
                        </span>
                        <div className="flex flex-wrap gap-1 justify-center">
                            <AnimatePresence>
                                {(binContents.get(i) || []).map((itemIdx) => (
                                    <motion.span
                                        key={itemIdx}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    >
                                        {items[itemIdx].text}
                                    </motion.span>
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Item chips */}
            <div className="flex flex-wrap gap-2 justify-center">
                {items.map((item, i) => {
                    const isPlaced = placements.has(i);
                    const isSelected = selectedItem === i;
                    const isWrong = wrongFlash === i;

                    if (isPlaced) return null;

                    return (
                        <motion.button
                            key={i}
                            onClick={() => handleItemTap(i)}
                            disabled={disabled}
                            animate={{
                                scale: isWrong ? [1, 0.95, 1.05, 1] : isSelected ? 1.03 : 1,
                                x: isWrong ? [0, -4, 4, 0] : 0,
                            }}
                            transition={{ duration: 0.3 }}
                            className={`
                                px-4 py-2.5 text-sm font-medium border transition-all duration-200
                                min-h-[44px]
                                ${isSelected
                                    ? 'bg-neutral-900 border-neutral-900 text-white'
                                    : isWrong
                                        ? 'bg-red-50 border-red-300 text-red-600'
                                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                                }
                            `}
                        >
                            {item.text}
                        </motion.button>
                    );
                })}
            </div>

            {/* Progress */}
            {placements.size > 0 && !allPlaced && (
                <p className="text-center text-[11px] text-neutral-400">
                    {placements.size} / {items.length} sorted
                </p>
            )}
        </div>
    );
}
