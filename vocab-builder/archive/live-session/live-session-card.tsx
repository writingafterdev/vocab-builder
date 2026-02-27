'use client';

import { useEffect, useState } from 'react';
import { Microphone, ArrowRight, SpinnerGap } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

interface EligibilityData {
    eligible: boolean;
    phraseCount: number;
    daysSinceLastSession: number;
    minPhrasesRequired: number;
}

/**
 * Card shown on Practice page when user is eligible for a Live Session
 */
export function LiveSessionCard() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [eligibility, setEligibility] = useState<EligibilityData | null>(null);

    useEffect(() => {
        if (!user) return;

        const checkEligibility = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/live-session/eligible', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.uid
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    setEligibility(data);
                }
            } catch (error) {
                console.error('Error checking live session eligibility:', error);
            } finally {
                setLoading(false);
            }
        };

        checkEligibility();
    }, [user]);

    // Don't show if loading or not eligible
    if (loading || !eligibility?.eligible) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px]"
        >
            {/* Animated glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50 blur-xl" />

            <div className="relative rounded-2xl bg-gray-900/90 backdrop-blur-xl p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 rounded-full bg-purple-500/20">
                                <Microphone className="w-5 h-5 text-purple-400" weight="fill" />
                            </div>
                            <span className="text-sm font-medium text-purple-400">
                                Weekly Live Session
                            </span>
                        </div>

                        <h3 className="text-xl font-bold text-white mb-1">
                            Ready to Practice Speaking?
                        </h3>

                        <p className="text-gray-400 text-sm mb-4">
                            You have <span className="text-white font-semibold">{eligibility.phraseCount} phrases</span> ready
                            for conversation practice. Test your speaking skills in a 2-minute chat!
                        </p>

                        <Link
                            href="/practice/live-session"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
                        >
                            Start Session
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* Decorative mic waves */}
                    <div className="hidden sm:flex flex-col gap-1 opacity-30">
                        {[1, 2, 3, 4].map((i) => (
                            <motion.div
                                key={i}
                                className="w-1 bg-purple-400 rounded-full"
                                animate={{
                                    height: [8, 24, 8],
                                }}
                                transition={{
                                    duration: 0.8,
                                    repeat: Infinity,
                                    delay: i * 0.1,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
