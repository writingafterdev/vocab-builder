'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'framer-motion';
import {
    BookOpen,
    Clock,
    Lightbulb,
    ArrowRight,
} from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import Link from 'next/link';
import { getUserPhrases } from '@/lib/db/srs';
import { getArticlesReadToday } from '@/lib/article-tracking';
import { SKILL_AXIS_META } from '@/lib/exercise/config';
import type { SkillAxis } from '@/lib/db/types';
import { authFromUser, clientApiJson } from '@/lib/client-api';

// ─── Types ────────────────────────────────────────────
interface DashPhrase {
    id: string;
    phrase: string;
    meaning: string;
    topics?: string[];
    usageCount: number;
    createdAt: Date;
}

// ─── Activity Heatmap ─────────────────────────────────
function ActivityMap({ data }: { data: number[] }) {
    const max = Math.max(...data, 1);

    const getColor = (value: number) => {
        if (value === 0) return 'bg-neutral-100';
        const intensity = value / max;
        if (intensity < 0.25) return 'bg-neutral-200';
        if (intensity < 0.5) return 'bg-neutral-400';
        if (intensity < 0.75) return 'bg-neutral-600';
        return 'bg-neutral-900';
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Legend */}
            <div className="flex items-center justify-end gap-2 text-[10px] text-neutral-400">
                <span>Less</span>
                <div className="flex gap-0.5">
                    <div className="w-2.5 h-2.5 bg-neutral-100" />
                    <div className="w-2.5 h-2.5 bg-neutral-200" />
                    <div className="w-2.5 h-2.5 bg-neutral-400" />
                    <div className="w-2.5 h-2.5 bg-neutral-600" />
                    <div className="w-2.5 h-2.5 bg-neutral-900" />
                </div>
                <span>More</span>
            </div>

            {/* 7 rows × 22 columns */}
            <div className="w-full overflow-x-auto no-scrollbar pb-2">
                <div
                    className="grid gap-[5px] min-w-max"
                    style={{
                        gridTemplateRows: 'repeat(7, 14px)',
                        gridTemplateColumns: 'repeat(22, 14px)',
                        gridAutoFlow: 'column',
                        justifyContent: 'flex-start',
                    }}
                >
                {data.map((value, i) => (
                    <div
                        key={i}
                        className={`w-[14px] h-[14px] ${getColor(value)}`}
                    />
                ))}
                </div>
            </div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────
export default function DashboardPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [allPhrases, setAllPhrases] = useState<DashPhrase[]>([]);
    const [dueCount, setDueCount] = useState(0);
    const [monthlyData, setMonthlyData] = useState<number[]>(Array(154).fill(0)); // 7×22 grid
    const [dailyQuote, setDailyQuote] = useState<{ text: string; postTitle: string; author: string; postId: string } | null>(null);

    const [immersiveEligible, setImmersiveEligible] = useState(false);
    const [hasDrills, setHasDrills] = useState(false);
    const [skillAxes, setSkillAxes] = useState<{ axis: string; accuracy: number; total: number }[]>([]);

    useEffect(() => {
        async function loadData() {
            if (!user?.$id) { setLoading(false); return; }

            try {
                const savedPhrases = await getUserPhrases(user.$id);
                const now = new Date();

                // Parse dates helper
                const toDate = (d: any): Date => {
                    if (d instanceof Date) return d;
                    if (d && typeof d === 'object' && 'toDate' in d) return d.toDate();
                    return new Date(d || Date.now());
                };

                // Map phrases
                const mapped: DashPhrase[] = savedPhrases.map(sp => ({
                    id: sp.id,
                    phrase: sp.phrase,
                    meaning: sp.meaning,
                    topics: sp.topics,
                    usageCount: sp.usageCount || 0,
                    createdAt: toDate(sp.createdAt),
                }));
                setAllPhrases(mapped);

                // Due count
                const due = savedPhrases.filter(p => {
                    if (!p.nextReviewDate) return true;
                    const nextReview = toDate(p.nextReviewDate);
                    return nextReview <= now;
                });
                setDueCount(due.length);

                // 154-day activity data (7×22 grid)
                const activityData = Array(154).fill(0);
                savedPhrases.forEach(p => {
                    const created = toDate(p.createdAt);
                    const daysAgo = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysAgo >= 0 && daysAgo < 154) {
                        activityData[153 - daysAgo]++;
                    }
                });
                setMonthlyData(activityData);

                // Fetch quote of the day
                try {
                    const qData = await clientApiJson<{ quotes?: Array<{ text: string; postTitle: string; author: string; postId: string }> }>('/api/quotes/get-mixed-quotes', {
                        auth: authFromUser(user),
                    });
                    const quotes = qData.quotes ?? [];
                    if (quotes.length > 0) {
                        // Pick a deterministic quote based on date
                        const dayIdx = new Date().getDate() % quotes.length;
                        setDailyQuote(quotes[dayIdx]);
                    }
                } catch { /* optional, don't block */ }
                // Check real exercise data
                try {
                    const auth = authFromUser(user);

                    clientApiJson<{ eligible: boolean }>('/api/immersive-session/eligible', {
                        auth,
                    })
                        .then(data => data && setImmersiveEligible(data.eligible))
                        .catch(() => { });

                    clientApiJson<{ hasDrills: boolean }>('/api/daily-drill/weaknesses', {
                        auth,
                    })
                        .then(data => data && setHasDrills(data.hasDrills))
                        .catch(() => { });

                    clientApiJson<{ axes?: { axis: string; accuracy: number; total: number }[] }>('/api/user/get-skill-axes', {
                        auth,
                    })
                        .then(data => data && setSkillAxes(data.axes || []))
                        .catch(() => { });
                } catch (e) {
                    console.error('Error fetching exercise stats', e);
                }

            } catch (error) {
                console.error('Error loading dashboard:', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [user?.$id]);

    // ─── Computed Stats ───
    const totalPhrases = allPhrases.length;

    const newThisWeek = useMemo(() => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return allPhrases.filter(p => p.createdAt > weekAgo).length;
    }, [allPhrases]);

    const mastered = useMemo(() => allPhrases.filter(p => p.usageCount >= 6).length, [allPhrases]);
    const reviewing = useMemo(() => allPhrases.filter(p => p.usageCount > 0 && p.usageCount < 6).length, [allPhrases]);
    const masteryPercent = totalPhrases > 0 ? Math.round((mastered / totalPhrases) * 100) : 0;

    // Streak: consecutive days with activity (from today backwards)
    const streak = useMemo(() => {
        let count = 0;
        // monthlyData[153] = today, [152] = yesterday, etc.
        for (let i = 153; i >= 0; i--) {
            if (monthlyData[i] > 0) count++;
            else break;
        }
        return count;
    }, [monthlyData]);

    const totalReviewed = useMemo(() => {
        return allPhrases.reduce((sum, p) => sum + p.usageCount, 0);
    }, [allPhrases]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <p className="text-neutral-400 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                    Please sign in to view your dashboard.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white font-sans">
            {/* ─── Header ─── */}
            <header className="max-w-6xl mx-auto px-6 pt-16 pb-10">
                <h1
                    className="text-[72px] font-normal text-neutral-900 leading-none tracking-tight"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    Dashboard.
                </h1>
                <p className="text-sm text-neutral-400 tracking-[0.08em] uppercase mt-3">
                    Analytics &amp; Learning Velocity
                </p>
            </header>

            <div className="max-w-6xl mx-auto px-6 pb-24">
                {/* ─── Bento Grid ─── */}
                <div className="border border-neutral-200">
                    {/* ─── Stat Cards (3-col) ─── */}
                    <div className="grid grid-cols-1 md:grid-cols-3">
                        {/* Total Lexicon */}
                        <div className="p-6 flex flex-col justify-between min-h-[180px] md:border-r border-b md:border-b-0 border-neutral-200">
                            <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-blue-600 ">Total Lexicon</span>
                                <BookOpen className="w-4 h-4 text-neutral-300" />
                            </div>
                            <div className="mt-auto">
                                <div className="flex items-baseline gap-2">
                                    <span
                                        className="text-[56px] font-normal text-neutral-900 leading-none tracking-tight"
                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                    >
                                        {totalPhrases.toLocaleString()}
                                    </span>
                                    {newThisWeek > 0 && (
                                        <span className="text-sm font-medium text-emerald-600">+{newThisWeek} this week</span>
                                    )}
                                </div>
                                <p className="text-xs text-neutral-400 italic mt-2" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                    {totalPhrases > 50
                                        ? `You're building a strong vocabulary foundation. Keep adding new phrases.`
                                        : totalPhrases > 0
                                            ? `Great start! Keep highlighting phrases while reading.`
                                            : `Start reading articles to build your vocabulary.`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Current Streak */}
                        <div className="p-6 flex flex-col justify-between min-h-[180px] md:border-r border-b md:border-b-0 border-neutral-200">
                            <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-amber-500 ">Current Streak</span>
                                <span className="text-neutral-300 text-lg">🔥</span>
                            </div>
                            <div className="mt-auto">
                                <div className="flex items-baseline gap-2">
                                    <span
                                        className="text-[56px] font-normal text-neutral-900 leading-none tracking-tight"
                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                    >
                                        {streak}
                                    </span>
                                    <span className="text-lg text-neutral-400 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>Days</span>
                                </div>
                                <p className="text-xs text-neutral-400 italic mt-2" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                    {streak > 7
                                        ? `Consistency is key. You've reviewed ${totalReviewed} words in this streak.`
                                        : streak > 0
                                            ? `Keep it going! Every day counts.`
                                            : `Start a streak by saving or reviewing phrases today.`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Mastery Level */}
                        <div className="p-6 flex flex-col justify-between min-h-[180px]">
                            <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-emerald-600 ">Mastery Level</span>
                                <Lightbulb className="w-4 h-4 text-neutral-300" />
                            </div>
                            <div className="mt-auto">
                                <span
                                    className="text-[56px] font-normal text-neutral-900 leading-none tracking-tight"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    {masteryPercent}%
                                </span>
                                {/* Progress bar */}
                                <div className="w-full h-1 bg-neutral-100 mt-3">
                                    <div
                                        className="h-full bg-neutral-900 transition-all duration-700"
                                        style={{ width: `${masteryPercent}%` }}
                                    />
                                </div>
                                <p className="text-xs text-neutral-400 italic mt-2" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                    Based on spaced repetition accuracy. {mastered} mastered, {reviewing} reviewing.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ─── Activity Map + Up Next (2-col) ─── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 border-t border-neutral-200">
                        {/* Activity Map — wider */}
                        <div className="lg:col-span-3 p-6 lg:border-r border-b lg:border-b-0 border-neutral-200">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-violet-600  inline-block mb-1">Review Consistency</span>
                                    <h3
                                        className="text-2xl font-normal text-neutral-900 tracking-tight mt-1"
                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                    >
                                        Activity Map
                                    </h3>
                                </div>
                            </div>
                            <ActivityMap data={monthlyData} />
                        </div>

                        {/* Up Next — narrower */}
                        <div className="lg:col-span-2 p-6 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-rose-600 ">Up Next</span>
                                <Clock className="w-4 h-4 text-neutral-300" />
                            </div>

                            <div className="flex-1 space-y-4">
                                {/* Exercise types */}
                                {[
                                    { name: 'Daily Practice', desc: 'Guided review path', icon: '🎯', available: true },
                                    { name: 'Daily Drill', desc: 'Targeted weaknesses', icon: '⚡', available: hasDrills },
                                    { name: 'Immersive Mode', desc: 'Contextual scenarios', icon: '📖', available: immersiveEligible },
                                ].map((ex, i) => (
                                    <div key={ex.name} className={ex.available ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}>
                                        {i > 0 && <div className="border-t border-neutral-50 mb-4" />}
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-2.5">
                                                <span className="text-base mt-0.5">{ex.icon}</span>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-neutral-900 line-clamp-1">{ex.name}</h4>
                                                    <p className="text-[11px] text-neutral-400 mt-0.5">{ex.desc}</p>
                                                </div>
                                            </div>
                                            {!ex.available && (
                                                <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold bg-neutral-100 px-1.5 py-0.5 ">
                                                    Locked
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="border-t border-neutral-100 pt-3">
                                    <p className="text-xs text-neutral-500">
                                        <span className="font-semibold text-neutral-900">{dueCount}</span> words due for review · ~{Math.max(5, Math.round(dueCount * 0.5))} min
                                    </p>
                                </div>
                            </div>

                            {/* Start Session Button */}
                            <motion.div
                                animate={dueCount > 0 ? {
                                    scale: [1, 1.02, 1],
                                    boxShadow: [
                                        "0px 0px 0px 0px rgba(0,0,0,0)",
                                        "0px 4px 14px 0px rgba(0,0,0,0.15)",
                                        "0px 0px 0px 0px rgba(0,0,0,0)"
                                    ]
                                } : {}}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="mt-8"
                            >
                                <Link
                                    href="/practice"
                                    className="group relative w-full py-3.5 bg-neutral-900 text-white text-sm font-bold uppercase tracking-[0.1em] text-center hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 overflow-hidden"
                                >
                                    {/* Shimmer effect inside button on hover */}
                                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        Start Session
                                        <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                                    </span>
                                </Link>
                            </motion.div>
                        </div>
                    </div>

                    {/* ─── Exercise Skills ─── */}
                    <div className="border-t border-neutral-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-indigo-600  inline-block mb-1">Exercise Skills</span>
                                <h3
                                    className="text-2xl font-normal text-neutral-900 tracking-tight mt-1"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    Skill Breakdown
                                </h3>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {(Object.entries(SKILL_AXIS_META) as [SkillAxis, typeof SKILL_AXIS_META[SkillAxis]][]).map(([axis, { label, sublabel, color }]) => {
                                const data = skillAxes.find(a => a.axis === axis);
                                const accuracy = data?.accuracy || 0;
                                const total = data?.total || 0;

                                const size = 72;
                                const strokeWidth = 4;
                                const radius = (size - strokeWidth) / 2;
                                const circumference = 2 * Math.PI * radius;
                                const offset = circumference - (accuracy / 100) * circumference;

                                return (
                                    <div key={axis} className="flex flex-col items-center py-3">
                                        <div className="relative" style={{ width: size, height: size }}>
                                            <svg width={size} height={size} className="-rotate-90">
                                                <circle
                                                    cx={size / 2}
                                                    cy={size / 2}
                                                    r={radius}
                                                    fill="none"
                                                    stroke="#f5f5f5"
                                                    strokeWidth={strokeWidth}
                                                />
                                                <motion.circle
                                                    cx={size / 2}
                                                    cy={size / 2}
                                                    r={radius}
                                                    fill="none"
                                                    stroke={color}
                                                    strokeWidth={strokeWidth}
                                                    strokeLinecap="round"
                                                    strokeDasharray={circumference}
                                                    initial={{ strokeDashoffset: circumference }}
                                                    animate={{ strokeDashoffset: offset }}
                                                    transition={{ duration: 1, delay: 0.5, ease: [0.25, 1, 0.5, 1] }}
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span
                                                    className="text-base font-normal text-neutral-900"
                                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                                >
                                                    {accuracy}%
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-xs font-semibold text-neutral-900 mt-2">{label}</p>
                                        <p className="text-[10px] text-neutral-400">{sublabel}</p>
                                        {total > 0 && (
                                            <p className="text-[10px] text-neutral-400 mt-0.5">{total} answers</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Quote of the Day ─── */}
                    {dailyQuote && (
                        <div className="p-8 border-t border-neutral-200">
                            <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-slate-600  inline-block mb-4">Quote of the Day</span>
                            <blockquote
                                className="text-[22px] text-neutral-700 leading-relaxed italic"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                &ldquo;{dailyQuote.text}&rdquo;
                            </blockquote>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
                                <p className="text-xs text-neutral-400">
                                    — {dailyQuote.author},{' '}
                                    <Link href={`/post/${dailyQuote.postId}`} className="underline hover:text-neutral-600 transition-colors">
                                        {dailyQuote.postTitle}
                                    </Link>
                                </p>
                                <Link
                                    href={`/post/${dailyQuote.postId}`}
                                    className="px-4 py-2 border border-neutral-200 text-neutral-700 text-xs font-bold uppercase tracking-wider hover:border-neutral-400 transition-colors flex-shrink-0"
                                >
                                    Read Article
                                </Link>
                            </div>
                        </div>
                    )}
                </div> {/* end bento wrapper */}
            </div>
        </div>
    );
}
