'use client';

/**
 * DailyDrillBanner - Small fixed-position button (bottom-right)
 */

import { useState, useEffect } from 'react';
import { Zap, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';

interface DailyDrillBannerProps {
    onStartDrill: () => void;
}

export function DailyDrillBanner({ onStartDrill }: DailyDrillBannerProps) {
    const { user } = useAuth();
    const [hasDrills, setHasDrills] = useState(false);
    const [drillCount, setDrillCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        async function checkDrills() {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/daily-drill/weaknesses', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setHasDrills(data.hasDrills);
                    setDrillCount(data.eligible?.length || 0);
                }
            } catch (error) {
                console.error('[DailyDrillBanner] Failed to check drills:', error);
            } finally {
                setLoading(false);
            }
        }

        checkDrills();
    }, [user]);

    if (loading || !hasDrills || dismissed) {
        return null;
    }

    return (
        <div
            className="fixed bottom-28 z-40"
            style={{
                left: '50%',
                transform: 'translateX(calc(-50% + 220px))',
            }}
        >
            {/* Main button */}
            <button
                onClick={onStartDrill}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="relative w-12 h-12 bg-neutral-900 hover:bg-neutral-800 text-white flex items-center justify-center transition-colors duration-200 shadow-lg group"
            >
                <Zap className="w-5 h-5" />
                {/* Pulse indicator */}
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white" />

                {/* Tooltip — absolutely positioned to the left */}
                <AnimatePresence>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-neutral-900 text-white px-3 py-2 text-xs font-sans whitespace-nowrap"
                        >
                            <span className="font-medium">Daily Drill</span>
                            <span className="text-neutral-400"> · {drillCount} area{drillCount !== 1 ? 's' : ''}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

            </button>
        </div>
    );
}
