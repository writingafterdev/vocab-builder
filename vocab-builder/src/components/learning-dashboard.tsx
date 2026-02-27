'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Target, Trophy, TrendingUp, BookOpen, GraduationCap } from 'lucide-react';

interface LearningStats {
    totalPhrases: number;
    masteredPhrases: number;
    learningPhrases: number;
    scenariosCompleted: number;
    currentStreak: number;
    bestStreak: number;
    weeklyReviews: number;
    activityData: number[]; // 84 days (12 weeks)
    totalHistory: number[];    // Real history of total phrases (last 14 days)
    masteredHistory: number[]; // Real history of mastered phrases (last 14 days)
    recentScenarios: Array<{
        id: string;
        scenario: string;
        phrasesUsed: number;
        totalPhrases: number;
        date: Date;
    }>;
}

interface LearningDashboardProps {
    stats: LearningStats;
}

const AreaChart = ({ data, height = 100 }: { data: number[], height?: number }) => {
    const max = Math.max(...data, 1);
    const min = 0;
    const range = max - min;
    const width = 100;

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height * 0.6) - (height * 0.2);
        return `${x},${y}`;
    });

    const svgPath = points.reduce((acc, point, i, a) => {
        if (i === 0) return `M ${point}`;

        const [currX, currY] = point.split(',').map(Number);
        const [prevX, prevY] = a[i - 1].split(',').map(Number);

        const controlX1 = prevX + (currX - prevX) / 2;
        const controlY1 = prevY;
        const controlX2 = prevX + (currX - prevX) / 2;
        const controlY2 = currY;

        return `${acc} C ${controlX1},${controlY1} ${controlX2},${controlY2} ${currX},${currY}`;
    }, '');

    const areaPath = `${svgPath} L 100,${height} L 0,${height} Z`;
    const color = '#1e3a5f'; // deep ink blue

    return (
        <div className="w-full h-full relative overflow-hidden">
            <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full h-full">
                <defs>
                    <linearGradient id="gradient-ink" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.12" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#gradient-ink)" />
                <path d={svgPath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
};

export default function LearningDashboard({ stats }: LearningDashboardProps) {
    const [showMastered, setShowMastered] = useState(false);

    const currentCount = showMastered ? stats.masteredPhrases : stats.totalPhrases;
    const currentLabel = showMastered ? "Mastered Phrases" : "Total Phrases";
    const historyData = showMastered ? stats.masteredHistory : stats.totalHistory;

    // Warm amber heatmap scale
    const getHeatmapColor = (count: number) => {
        if (count === 0) return 'bg-neutral-100/50';
        if (count <= 1) return 'bg-amber-200';
        if (count <= 3) return 'bg-amber-300';
        if (count <= 5) return 'bg-amber-500';
        return 'bg-amber-700';
    };

    // Score bar with accent
    const getScoreBarColor = (used: number, total: number) => {
        const ratio = total > 0 ? used / total : 0;
        if (ratio >= 0.8) return 'bg-[#1e3a5f]';
        if (ratio >= 0.5) return 'bg-amber-400';
        return 'bg-neutral-300';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-sans">
            {/* Top Row: Main Graph Card + Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Main Graph Card */}
                <div className="lg:col-span-2 relative">
                    <div className="h-full border border-neutral-200 overflow-hidden bg-white">
                        <div className="p-6 h-full flex flex-col justify-between relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium mb-1">{currentLabel}</p>
                                    <div className="flex items-center gap-3">
                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={currentCount}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="text-5xl font-serif text-neutral-900 tracking-tight"
                                            >
                                                {currentCount}
                                            </motion.span>
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Toggle */}
                                <button
                                    onClick={() => setShowMastered(!showMastered)}
                                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center border transition-colors duration-200 ease-in-out focus:outline-none ${showMastered ? 'bg-[#1e3a5f] border-[#1e3a5f]' : 'bg-neutral-200 border-neutral-300'}`}
                                >
                                    <span className="sr-only">Toggle view</span>
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-5 w-5 transform bg-white shadow transition duration-200 ease-in-out ${showMastered ? 'translate-x-6' : 'translate-x-0.5'}`}
                                    />
                                </button>
                            </div>

                            {/* Area Chart */}
                            <div className="h-48 w-full -mx-2">
                                <AreaChart data={historyData} height={150} />
                            </div>

                            {/* X-Axis Labels */}
                            <div className="flex justify-between text-[10px] text-neutral-400 mt-2 px-2 uppercase tracking-[0.1em]">
                                <span>14 days ago</span>
                                <span>7 days ago</span>
                                <span>Today</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Other Stats */}
                <div className="space-y-4">
                    {/* Scenarios Completed */}
                    <div className="bg-white border border-neutral-200 p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Scenarios</p>
                            <p className="text-2xl font-serif text-neutral-900">{stats.scenariosCompleted}</p>
                        </div>
                        <div className="h-9 w-9 border border-[#1e3a5f]/20 bg-[#1e3a5f]/5 flex items-center justify-center">
                            <Target className="h-4 w-4 text-[#1e3a5f]" />
                        </div>
                    </div>

                    {/* Current Streak */}
                    <div className="bg-white border border-neutral-200 p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Streak</p>
                            <div className="flex items-baseline gap-1.5">
                                <p className="text-2xl font-serif text-neutral-900">{stats.currentStreak}</p>
                                <p className="text-xs text-neutral-400">days</p>
                            </div>
                        </div>
                        <div className="h-9 w-9 border border-amber-200 bg-amber-50 flex items-center justify-center">
                            <Flame className="h-4 w-4 text-amber-600" />
                        </div>
                    </div>

                    {/* Weekly Reviews */}
                    <div className="bg-white border border-neutral-200 p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">This Week</p>
                            <p className="text-2xl font-serif text-neutral-900">{stats.weeklyReviews}</p>
                        </div>
                        <div className="h-9 w-9 border border-neutral-200 bg-neutral-50 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-neutral-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* GitHub-Style Contribution Heatmap */}
                <div className="border border-neutral-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">Learning Activity</h3>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                            <span>Less</span>
                            <div className="flex gap-1">
                                <div className="w-2.5 h-2.5 bg-neutral-100/50" />
                                <div className="w-2.5 h-2.5 bg-amber-200" />
                                <div className="w-2.5 h-2.5 bg-amber-300" />
                                <div className="w-2.5 h-2.5 bg-amber-500" />
                                <div className="w-2.5 h-2.5 bg-amber-700" />
                            </div>
                            <span>More</span>
                        </div>
                    </div>

                    {/* Heatmap Grid */}
                    <div className="overflow-x-auto pb-2">
                        <div className="flex text-[10px] text-neutral-400 mb-1 ml-5 gap-8">
                            <span>Oct</span>
                            <span>Nov</span>
                            <span>Dec</span>
                        </div>
                        <div className="flex gap-1">
                            <div className="flex flex-col justify-between text-[9px] text-neutral-400 pr-1 h-[88px] py-1">
                                <span>Mon</span>
                                <span>Wed</span>
                                <span>Fri</span>
                            </div>

                            <div className="grid grid-rows-7 grid-flow-col gap-1">
                                {stats.activityData.map((count, idx) => (
                                    <div
                                        key={idx}
                                        className={`w-2.5 h-2.5 ${getHeatmapColor(count)} hover:ring-1 hover:ring-neutral-400 transition-all cursor-default`}
                                        title={`${count} phrases reviewed`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Scenarios */}
                <div className="border border-neutral-200 bg-white p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">Recent Scenarios</h3>
                        <Trophy className="h-4 w-4 text-neutral-400" />
                    </div>

                    {stats.recentScenarios.length > 0 ? (
                        <div className="space-y-4">
                            {stats.recentScenarios.map((scenario) => (
                                <div
                                    key={scenario.id}
                                    className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0"
                                >
                                    <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-sm text-neutral-700 truncate">{scenario.scenario}</p>
                                        <p className="text-[11px] text-neutral-400 mt-0.5">
                                            {scenario.date.toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <span className="text-xs font-medium text-neutral-900 block">
                                                {scenario.totalPhrases > 0 ? Math.round((scenario.phrasesUsed / scenario.totalPhrases) * 100) : 0}%
                                            </span>
                                            <span className="text-[10px] text-neutral-400">Score</span>
                                        </div>
                                        <div className={`h-8 w-1.5 ${getScoreBarColor(scenario.phrasesUsed, scenario.totalPhrases)}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-500">
                            <BookOpen className="h-6 w-6 mb-2 opacity-20" />
                            <p className="text-sm">No scenarios yet.</p>
                            <p className="text-xs opacity-60">Start practicing to track progress!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
