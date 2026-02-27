'use client';

/**
 * IntonationChart - Clear pitch contour comparison
 * Shows expected vs actual pitch with DISTINCT visual styling
 */

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface IntonationChartProps {
    words: string[];
    expectedPattern: number[];
    userPattern: number[];
}

export function IntonationChart({
    words,
    expectedPattern,
    userPattern
}: IntonationChartProps) {
    const [isAnimated, setIsAnimated] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsAnimated(true), 300);
        return () => clearTimeout(timer);
    }, []);

    if (words.length === 0 || expectedPattern.length === 0) {
        return null;
    }

    const dataLength = Math.min(expectedPattern.length, words.length);
    const displayWords = words.slice(0, dataLength);
    const displayExpected = expectedPattern.slice(0, dataLength);
    const displayUser = userPattern.slice(0, dataLength);
    const hasUserData = displayUser.length > 0;

    const width = 400;
    const height = 140;
    const paddingX = 20;
    const paddingY = 25;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingY * 2;

    // Generate SVG path with optional Y offset
    const getPath = (pattern: number[], yOffset = 0) => {
        if (pattern.length === 0) return '';
        const stepX = chartWidth / Math.max(1, pattern.length - 1);

        return pattern.map((val, i) => {
            const x = paddingX + i * stepX;
            const y = paddingY + (1 - val) * chartHeight + yOffset;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
    };

    // Calculate match percentage
    const matchScore = hasUserData
        ? Math.round(100 - (displayExpected.reduce((acc, exp, i) => {
            const user = displayUser[i] ?? exp;
            return acc + Math.abs(exp - user) * 100;
        }, 0) / displayExpected.length))
        : null;

    // Check if patterns are very similar (would overlap)
    const patternsOverlap = hasUserData && matchScore !== null && matchScore >= 95;

    // Offset expected line down by 8px if patterns overlap too much
    const expectedPath = getPath(displayExpected, patternsOverlap ? 8 : 0);
    const userPath = getPath(displayUser);

    const getExplanation = () => {
        if (!hasUserData) return 'Recording needed to compare pitch patterns.';
        if (matchScore === null) return '';
        if (matchScore >= 95) return '🎯 Perfect! Your intonation matches the native pattern exactly.';
        if (matchScore >= 80) return 'Excellent intonation! Minor variations in pitch emphasis.';
        if (matchScore >= 60) return 'Good effort. Focus on rising/falling on emphasized words.';
        return 'Your pitch pattern differs significantly. Try varying pitch more on content words.';
    };

    return (
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-slate-400 text-xs uppercase tracking-wide">
                    Pitch Pattern
                </h4>
                {matchScore !== null && (
                    <span className={`text-sm font-bold ${matchScore >= 80 ? 'text-green-400' :
                            matchScore >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                        {matchScore}% match
                    </span>
                )}
            </div>

            <p className="text-slate-400 text-xs mb-3">{getExplanation()}</p>

            {/* SVG Chart */}
            <div className="relative bg-slate-800/50 rounded-lg overflow-hidden">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="w-full"
                    style={{ height: '120px' }}
                >
                    {/* Background grid */}
                    {[0, 0.25, 0.5, 0.75, 1].map((y, i) => (
                        <line
                            key={i}
                            x1={paddingX}
                            y1={paddingY + y * chartHeight}
                            x2={width - paddingX}
                            y2={paddingY + y * chartHeight}
                            stroke="rgba(148, 163, 184, 0.15)"
                            strokeWidth="1"
                        />
                    ))}

                    {/* Y-axis labels */}
                    <text x={8} y={paddingY + 4} fontSize="10" fill="rgba(148,163,184,0.5)">High</text>
                    <text x={8} y={paddingY + chartHeight} fontSize="10" fill="rgba(148,163,184,0.5)">Low</text>

                    {/* USER PATTERN FIRST (so expected shows on top) */}
                    {hasUserData && (
                        <motion.path
                            d={userPath}
                            fill="none"
                            stroke={matchScore && matchScore >= 70 ? '#34d399' : '#f59e0b'}
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: isAnimated ? 1 : 0 }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    )}

                    {/* EXPECTED PATTERN ON TOP - BRIGHT CYAN DASHED */}
                    <path
                        d={expectedPath}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="3"
                        strokeDasharray="10 5"
                        strokeLinecap="round"
                        opacity={0.9}
                    />

                    {/* Dots on expected line for visibility */}
                    {displayExpected.map((val, i) => {
                        const stepX = chartWidth / Math.max(1, displayExpected.length - 1);
                        const x = paddingX + i * stepX;
                        const y = paddingY + (1 - val) * chartHeight + (patternsOverlap ? 8 : 0);
                        return (
                            <circle
                                key={`exp-${i}`}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="#38bdf8"
                                stroke="#1e3a5f"
                                strokeWidth="1.5"
                            />
                        );
                    })}

                    {/* Data points on user line */}
                    {hasUserData && isAnimated && displayUser.map((val, i) => {
                        const stepX = chartWidth / Math.max(1, displayUser.length - 1);
                        const x = paddingX + i * stepX;
                        const y = paddingY + (1 - val) * chartHeight;

                        return (
                            <motion.circle
                                key={`user-${i}`}
                                cx={x}
                                cy={y}
                                r="6"
                                fill={matchScore && matchScore >= 70 ? '#34d399' : '#f59e0b'}
                                stroke="rgba(0,0,0,0.4)"
                                strokeWidth="2"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.6 + i * 0.03 }}
                            />
                        );
                    })}
                </svg>

                {/* Word labels */}
                <div className="flex justify-between px-4 py-2 bg-slate-800/80">
                    {displayWords.map((word, i) => (
                        <span
                            key={i}
                            className="text-[11px] text-slate-400 truncate text-center"
                            style={{ width: `${100 / displayWords.length}%` }}
                        >
                            {word.length > 7 ? word.slice(0, 5) + '…' : word}
                        </span>
                    ))}
                </div>
            </div>

            {/* Legend - CLEARER with actual colors */}
            <div className="flex items-center justify-center gap-8 mt-3 text-xs">
                <div className="flex items-center gap-2">
                    <svg width="32" height="12" viewBox="0 0 32 12">
                        <line x1="0" y1="6" x2="32" y2="6" stroke="#38bdf8" strokeWidth="3" strokeDasharray="6 3" />
                        <circle cx="16" cy="6" r="3" fill="#38bdf8" />
                    </svg>
                    <span className="text-slate-300">Expected (native)</span>
                </div>
                <div className="flex items-center gap-2">
                    <svg width="32" height="12" viewBox="0 0 32 12">
                        <line x1="0" y1="6" x2="32" y2="6" stroke={matchScore && matchScore >= 70 ? '#34d399' : '#f59e0b'} strokeWidth="4" />
                        <circle cx="16" cy="6" r="4" fill={matchScore && matchScore >= 70 ? '#34d399' : '#f59e0b'} />
                    </svg>
                    <span className="text-slate-300">Your pitch</span>
                </div>
            </div>
        </div>
    );
}
