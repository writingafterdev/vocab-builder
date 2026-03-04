'use client';

import { motion } from 'framer-motion';
import type { LexileLevel } from '@/lib/db/types';

interface LevelSwitcherProps {
    selectedLevel: LexileLevel;
    availableLevels: LexileLevel[];
    onLevelChange: (level: LexileLevel) => void;
    className?: string;
}

const LEVEL_LABELS: Record<LexileLevel, { label: string; desc: string }> = {
    A1: { label: 'A1', desc: 'Beginner' },
    A2: { label: 'A2', desc: 'Elementary' },
    B1: { label: 'B1', desc: 'Intermediate' },
    B2: { label: 'B2', desc: 'Original' },
};

export function LevelSwitcher({
    selectedLevel,
    availableLevels,
    onLevelChange,
    className = '',
}: LevelSwitcherProps) {
    if (availableLevels.length <= 1) return null;

    return (
        <div className={`flex items-center justify-center ${className}`}>
            <div className="inline-flex items-center bg-neutral-100 p-0.5">
                {availableLevels.map((level) => {
                    const isActive = level === selectedLevel;
                    return (
                        <button
                            key={level}
                            onClick={() => onLevelChange(level)}
                            className="relative px-4 py-1.5 text-xs font-medium transition-colors duration-150"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="level-switcher-active"
                                    className="absolute inset-0 bg-white shadow-sm"
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <span
                                className={`relative z-10 ${isActive
                                        ? 'text-neutral-900'
                                        : 'text-neutral-400 hover:text-neutral-600'
                                    }`}
                            >
                                {LEVEL_LABELS[level].label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
