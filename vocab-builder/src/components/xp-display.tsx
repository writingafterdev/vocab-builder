'use client';

/**
 * XP Display - Shows user's XP in header with level badge
 * Includes animated notification on XP earn
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Trophy, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { XP_CONFIG } from '@/types';
import Link from 'next/link';

interface XpDisplayProps {
    compact?: boolean;
}

export function XpDisplay({ compact = false }: XpDisplayProps) {
    const { profile } = useAuth();
    const [xpNotification, setXpNotification] = useState<number | null>(null);

    const xp = profile?.stats?.xp || 0;
    const level = profile?.stats?.level || 1;
    const xpInLevel = xp % XP_CONFIG.XP_PER_LEVEL;
    const progress = (xpInLevel / XP_CONFIG.XP_PER_LEVEL) * 100;

    // Listen for XP earned events
    useEffect(() => {
        const handleXpEarned = (event: CustomEvent<{ amount: number }>) => {
            setXpNotification(event.detail.amount);
            setTimeout(() => setXpNotification(null), 2000);
        };

        window.addEventListener('xp-earned', handleXpEarned as EventListener);
        return () => window.removeEventListener('xp-earned', handleXpEarned as EventListener);
    }, []);

    if (compact) {
        return (
            <Link href="/rewards" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 transition-colors relative">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">{xp.toLocaleString()}</span>

                {/* XP notification animation */}
                <AnimatePresence>
                    {xpNotification && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -20, scale: 1 }}
                            exit={{ opacity: 0, y: -40, scale: 0.8 }}
                            className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap"
                        >
                            <span className="text-sm font-bold text-green-400">+{xpNotification} XP</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Link>
        );
    }

    return (
        <Link href="/rewards" className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors relative group">
            {/* Level badge */}
            <div className="relative">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-900 border-2 border-amber-400 flex items-center justify-center">
                    <span className="text-xs font-bold text-amber-400">{level}</span>
                </div>
            </div>

            {/* XP info */}
            <div className="flex flex-col min-w-[80px]">
                <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span className="text-sm font-semibold text-white">{xp.toLocaleString()} XP</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                    <motion.div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
                <span className="text-xs text-slate-400 mt-0.5">Level {level}</span>
            </div>

            {/* Hover tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-slate-400 whitespace-nowrap">Click to view rewards</span>
            </div>

            {/* XP notification animation */}
            <AnimatePresence>
                {xpNotification && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: -30, scale: 1 }}
                        exit={{ opacity: 0, y: -50, scale: 0.8 }}
                        className="absolute -top-4 left-1/2 -translate-x-1/2"
                    >
                        <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                            <span className="text-sm font-bold text-green-400">+{xpNotification} XP</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Link>
    );
}

// Helper to trigger XP notification from anywhere
export function triggerXpNotification(amount: number) {
    window.dispatchEvent(new CustomEvent('xp-earned', { detail: { amount } }));
}
