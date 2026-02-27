'use client';

/**
 * Rewards Page - View XP balance and redeem for premium time
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Clock, Gift, CheckCircle, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { XP_CONFIG } from '@/types';
import Link from 'next/link';

interface RedeemOption {
    days: 1 | 7 | 30;
    xpCost: number;
    label: string;
    savings?: string;
}

const REDEEM_OPTIONS: RedeemOption[] = [
    { days: 1, xpCost: XP_CONFIG.REDEEM_1_DAY, label: '1 Day' },
    { days: 7, xpCost: XP_CONFIG.REDEEM_7_DAYS, label: '7 Days', savings: 'Save 14%' },
    { days: 30, xpCost: XP_CONFIG.REDEEM_30_DAYS, label: '30 Days', savings: 'Save 33%' },
];

export default function RewardsPage() {
    const { user, profile } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [redeemSuccess, setRedeemSuccess] = useState<{ days: number; newExpiry: string } | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const xp = profile?.stats?.xp || 0;
    const level = profile?.stats?.level || 1;
    const xpInLevel = xp % XP_CONFIG.XP_PER_LEVEL;
    const progress = (xpInLevel / XP_CONFIG.XP_PER_LEVEL) * 100;
    const subStatus = profile?.subscription?.status;
    const currentPeriodEnd = profile?.subscription?.currentPeriodEnd;

    // Fetch XP history
    useEffect(() => {
        async function fetchHistory() {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/user/xp-history?limit=20', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.uid
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setHistory(data.transactions || []);
                }
            } catch (e) {
                console.error('Failed to fetch XP history:', e);
            } finally {
                setLoadingHistory(false);
            }
        }
        fetchHistory();
    }, [user]);

    const handleRedeem = async (option: RedeemOption) => {
        if (!user || xp < option.xpCost) return;

        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/user/redeem-xp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({ days: option.days })
            });

            if (res.ok) {
                const data = await res.json();
                setRedeemSuccess({
                    days: option.days,
                    newExpiry: data.newExpiryDate
                });
            }
        } catch (e) {
            console.error('Redeem failed:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getSourceLabel = (source: string) => {
        const labels: Record<string, string> = {
            'daily_drill_complete': 'Daily Drill',
            'reading_session_complete': 'Reading Session',
            'listening_session_complete': 'Listening Session',
            'speaking_chunk_complete': 'Speaking Practice',
            'phrase_saved': 'Phrase Saved',
            'streak_bonus': 'Streak Bonus',
            'perfect_score_bonus': 'Perfect Score',
            'redeem_premium': 'Premium Redeemed'
        };
        return labels[source] || source;
    };

    return (
        <div className="min-h-screen bg-slate-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">Rewards</h1>
                    <p className="text-slate-500">Earn XP from activities, redeem for premium time</p>
                </div>

                {/* XP Balance Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white mb-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                                <Trophy className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm text-white/80">Your Balance</p>
                                <p className="text-3xl font-bold">{xp.toLocaleString()} XP</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-white/80">Level</p>
                            <p className="text-3xl font-bold">{level}</p>
                        </div>
                    </div>

                    {/* Level progress */}
                    <div className="bg-white/20 rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full bg-white transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-white/60 mt-2">
                        {xpInLevel} / {XP_CONFIG.XP_PER_LEVEL} XP to Level {level + 1}
                    </p>
                </motion.div>

                {/* Current subscription status */}
                {currentPeriodEnd && subStatus === 'active' && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                        <div className="flex items-center gap-2 text-green-700">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">Premium Active</span>
                        </div>
                        <p className="text-sm text-green-600 mt-1">
                            Expires: {formatDate(currentPeriodEnd.toString())}
                        </p>
                    </div>
                )}

                {/* Redeem Options */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                    <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <Gift className="h-5 w-5 text-amber-500" />
                        Redeem for Premium
                    </h2>

                    <div className="space-y-3">
                        {REDEEM_OPTIONS.map((option) => {
                            const canAfford = xp >= option.xpCost;
                            return (
                                <button
                                    key={option.days}
                                    onClick={() => handleRedeem(option)}
                                    disabled={!canAfford || isLoading}
                                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all
                                        ${canAfford
                                            ? 'border-amber-200 hover:border-amber-400 hover:bg-amber-50 cursor-pointer'
                                            : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Clock className={`h-5 w-5 ${canAfford ? 'text-amber-500' : 'text-slate-400'}`} />
                                        <div className="text-left">
                                            <p className={`font-medium ${canAfford ? 'text-slate-900' : 'text-slate-500'}`}>
                                                {option.label} Premium
                                            </p>
                                            {option.savings && (
                                                <span className="text-xs text-green-600 font-medium">{option.savings}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Zap className={`h-4 w-4 ${canAfford ? 'text-amber-500' : 'text-slate-400'}`} />
                                        <span className={`font-semibold ${canAfford ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {option.xpCost.toLocaleString()} XP
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* How to earn XP */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                    <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        How to Earn XP
                    </h2>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-600">Complete Daily Drill</span>
                            <span className="font-medium text-slate-900">+{XP_CONFIG.DAILY_DRILL} XP</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Reading/Listening Session</span>
                            <span className="font-medium text-slate-900">+{XP_CONFIG.READING_SESSION} XP</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Speaking Practice (90%+)</span>
                            <span className="font-medium text-slate-900">+{XP_CONFIG.SPEAKING_CHUNK} XP</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Save a Phrase</span>
                            <span className="font-medium text-slate-900">+{XP_CONFIG.PHRASE_SAVED} XP</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Perfect Score Bonus (90%+)</span>
                            <span className="font-medium text-green-600">+{XP_CONFIG.PERFECT_BONUS} XP</span>
                        </div>
                        <div className="border-t border-slate-100 pt-3 flex justify-between">
                            <span className="text-slate-600">Daily Cap</span>
                            <span className="font-medium text-slate-900">{XP_CONFIG.DAILY_CAP_TOTAL} XP max</span>
                        </div>
                    </div>
                </div>

                {/* XP History */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h2 className="font-semibold text-slate-900 mb-4">Recent Activity</h2>
                    {loadingHistory ? (
                        <div className="text-center py-8 text-slate-400">Loading...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">No XP earned yet. Start learning!</div>
                    ) : (
                        <div className="space-y-2">
                            {history.slice(0, 10).map((tx, i) => (
                                <div key={tx.id || i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700">{getSourceLabel(tx.source)}</p>
                                        <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                                    </div>
                                    <span className={`font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {tx.amount > 0 ? '+' : ''}{tx.amount} XP
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Success Modal */}
                <AnimatePresence>
                    {redeemSuccess && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                            onClick={() => setRedeemSuccess(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Success!</h3>
                                <p className="text-slate-600 mb-4">
                                    You've redeemed {redeemSuccess.days} day{redeemSuccess.days > 1 ? 's' : ''} of premium.
                                </p>
                                <p className="text-sm text-slate-500 mb-6">
                                    New expiry: {formatDate(redeemSuccess.newExpiry)}
                                </p>
                                <Button onClick={() => window.location.reload()} className="w-full">
                                    Continue
                                </Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
