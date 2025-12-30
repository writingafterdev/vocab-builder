'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Target, Trophy, TrendingUp, BookOpen, GraduationCap } from 'lucide-react';

interface LearningStats {
    totalPhrases: number;
    masteredPhrases: number;
    learningPhrases: number;
    debatesCompleted: number;
    currentStreak: number;
    bestStreak: number;
    weeklyReviews: number;
    activityData: number[]; // 84 days (12 weeks)
    totalHistory: number[];    // Real history of total phrases (last 14 days)
    masteredHistory: number[]; // Real history of mastered phrases (last 14 days)
    recentDebates: Array<{
        id: string;
        topic: string;
        phrasesUsed: number;
        totalPhrases: number;
        date: Date;
    }>;
}

interface LearningDashboardProps {
    stats: LearningStats;
}

const AreaChart = ({ data, color, height = 100 }: { data: number[], color: string, height?: number }) => {
    const max = Math.max(...data, 1);
    const min = 0;
    const range = max - min;
    const width = 100; // Viewbox width

    // Generate points for the line
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height * 0.6) - (height * 0.2); // Leave some padding
        return `${x},${y}`;
    });

    const svgPath = points.reduce((acc, point, i, a) => {
        if (i === 0) return `M ${point}`;

        const [currX, currY] = point.split(',').map(Number);
        const [prevX, prevY] = a[i - 1].split(',').map(Number);

        // Simple smoothing: control point halfway in X, same Y as previous/current (giving an S-curve)
        const controlX1 = prevX + (currX - prevX) / 2;
        const controlY1 = prevY;
        const controlX2 = prevX + (currX - prevX) / 2;
        const controlY2 = currY;

        return `${acc} C ${controlX1},${controlY1} ${controlX2},${controlY2} ${currX},${currY}`;
    }, '');

    // Close the area
    const areaPath = `${svgPath} L 100,${height} L 0,${height} Z`;

    return (
        <div className="w-full h-full relative overflow-hidden">
            <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full h-full">
                <defs>
                    <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#gradient-${color.replace('#', '')})`} />
                <path d={svgPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
};

export default function LearningDashboard({ stats }: LearningDashboardProps) {
    const [showMastered, setShowMastered] = useState(false);

    // Graph config
    const graphColor = showMastered ? '#22c55e' : '#3b82f6'; // Green vs Blue hex
    const currentCount = showMastered ? stats.masteredPhrases : stats.totalPhrases;
    const currentLabel = showMastered ? "Mastered Phrases" : "Total Phrases";

    // Use real history data
    const historyData = showMastered ? stats.masteredHistory : stats.totalHistory;

    // Get color intensity for heatmap cell (0-4 scale) - Using Emerald Scale for premium look
    const getHeatmapColor = (count: number) => {
        if (count === 0) return 'bg-neutral-100/50'; // More transparent empty state
        if (count <= 1) return 'bg-emerald-200';
        if (count <= 3) return 'bg-emerald-400';
        if (count <= 5) return 'bg-emerald-500';
        return 'bg-emerald-600';
    };

    // Get debate result badge color
    const getDebateBadgeColor = (used: number, total: number) => {
        const ratio = used / total;
        if (ratio >= 0.8) return 'bg-green-500 text-white';
        if (ratio >= 0.5) return 'bg-yellow-500 text-white';
        return 'bg-red-500 text-white';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Row: Main Graph Card + Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Graph Card - Solar Style */}
                <div className="lg:col-span-2 relative">
                    <Card className="h-full border-neutral-200 shadow-sm overflow-hidden bg-white">
                        <CardContent className="p-6 h-full flex flex-col justify-between relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {showMastered ? <GraduationCap className="w-5 h-5 text-green-500" /> : <BookOpen className="w-5 h-5 text-blue-500" />}
                                        <h3 className="font-semibold text-neutral-600 dark:text-neutral-400">{currentLabel}</h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={currentCount}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="text-5xl font-bold text-neutral-900 tracking-tight"
                                            >
                                                {currentCount}
                                            </motion.span>
                                        </AnimatePresence>
                                        <div className="flex flex-col text-xs font-medium text-neutral-400">
                                            <span>Earlier</span>
                                            <span className="text-green-500">+2</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom Toggle */}
                                <button
                                    onClick={() => setShowMastered(!showMastered)}
                                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-0 ${showMastered ? 'bg-green-500' : 'bg-blue-500'}`}
                                >
                                    <span className="sr-only">Toggle setting</span>
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showMastered ? 'translate-x-7' : 'translate-x-0'}`}
                                    />
                                </button>
                            </div>

                            {/* Area Chart */}
                            <div className="h-48 w-full -mx-2">
                                <AreaChart data={historyData} color={graphColor} height={150} />
                            </div>

                            {/* X-Axis Labels */}
                            <div className="flex justify-between text-xs text-neutral-400 mt-2 px-2">
                                <span>14 days ago</span>
                                <span>7 days ago</span>
                                <span>Today</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Other Stats */}
                <div className="space-y-4">
                    {/* Debates Completed */}
                    <Card className="bg-white border-neutral-200 hover:shadow-md transition-shadow">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-neutral-500">Debates</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.debatesCompleted}</p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                                <Target className="h-5 w-5 text-purple-600" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Current Streak */}
                    <Card className="bg-white border-neutral-200 hover:shadow-md transition-shadow">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-neutral-500">Streak</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-2xl font-bold text-neutral-900">{stats.currentStreak}</p>
                                    <p className="text-xs text-neutral-400 font-medium">days</p>
                                </div>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                                <Flame className="h-5 w-5 text-orange-600" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Weekly Reviews */}
                    <Card className="bg-white border-neutral-200 hover:shadow-md transition-shadow">
                        <CardContent className="p-5 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-neutral-500">This Week</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.weeklyReviews}</p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-teal-600" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* GitHub-Style Contribution Heatmap */}
                <Card className="border-neutral-200 bg-white">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-neutral-800">Learning Activity</h3>
                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                                <span>Less</span>
                                <div className="flex gap-1">
                                    <div className="w-2.5 h-2.5 rounded-[1px] bg-neutral-100/50" />
                                    <div className="w-2.5 h-2.5 rounded-[1px] bg-emerald-200" />
                                    <div className="w-2.5 h-2.5 rounded-[1px] bg-emerald-400" />
                                    <div className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500" />
                                    <div className="w-2.5 h-2.5 rounded-[1px] bg-emerald-600" />
                                </div>
                                <span>More</span>
                            </div>
                        </div>

                        {/* Heatmap Grid - 12 weeks x 7 days */}
                        <div className="overflow-x-auto pb-2">
                            <div className="flex text-[10px] text-neutral-400 mb-1 ml-5 gap-8">
                                <span>Oct</span>
                                <span>Nov</span>
                                <span>Dec</span>
                            </div>
                            <div className="flex gap-1">
                                {/* Day labels */}
                                <div className="flex flex-col justify-between text-[9px] text-neutral-400 pr-1 h-[88px] py-1">
                                    <span>Mon</span>
                                    <span>Wed</span>
                                    <span>Fri</span>
                                </div>

                                {/* Grid */}
                                <div className="grid grid-rows-7 grid-flow-col gap-1">
                                    {stats.activityData.map((count, idx) => (
                                        <div
                                            key={idx}
                                            className={`w-2.5 h-2.5 rounded-[1px] ${getHeatmapColor(count)} hover:ring-1 hover:ring-neutral-400 transition-all cursor-title`}
                                            title={`${count} phrases reviewed`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Debates */}
                <Card className="border-neutral-200 bg-white">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-neutral-800">Recent Debates</h3>
                            <Trophy className="h-4 w-4 text-neutral-400" />
                        </div>

                        {stats.recentDebates.length > 0 ? (
                            <div className="space-y-4">
                                {stats.recentDebates.map((debate) => (
                                    <div
                                        key={debate.id}
                                        className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0"
                                    >
                                        <div className="flex-1 min-w-0 mr-4">
                                            <p className="font-medium text-sm text-neutral-700 truncate">{debate.topic}</p>
                                            <p className="text-xs text-neutral-500 mt-0.5">
                                                {debate.date.toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right">
                                                <span className="text-xs font-medium text-neutral-900 block">
                                                    {Math.round((debate.phrasesUsed / debate.totalPhrases) * 100)}%
                                                </span>
                                                <span className="text-[10px] text-neutral-400">Score</span>
                                            </div>
                                            <div className={`h-8 w-1.5 rounded-full ${getDebateBadgeColor(debate.phrasesUsed, debate.totalPhrases).replace('text-white', '')} opacity-80`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-500">
                                <BookOpen className="h-8 w-8 mb-2 opacity-20" />
                                <p className="text-sm">No debates yet.</p>
                                <p className="text-xs opacity-60">Start practicing to track progress!</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
