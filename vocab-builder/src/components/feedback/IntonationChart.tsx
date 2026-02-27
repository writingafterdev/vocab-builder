'use client';

/**
 * IntonationChart - Visual comparison of user vs native intonation patterns
 * 
 * Displays a line chart with:
 * - Orange line: Expected native pattern
 * - Green line: User's actual pattern
 * - Words on x-axis
 * - Highlights key moments with divergence
 */

import { useMemo } from 'react';

interface KeyMoment {
    word: string;
    wordIndex: number;
    expected: 'rising' | 'falling' | 'flat';
    actual: 'rising' | 'falling' | 'flat';
    correct: boolean;
}

interface IntonationChartProps {
    words: string[];
    expectedPattern: number[];
    userPattern: number[];
    keyMoments?: KeyMoment[];
    height?: number;
}

export function IntonationChart({
    words,
    expectedPattern,
    userPattern,
    keyMoments = [],
    height = 120
}: IntonationChartProps) {
    // Don't render if no data
    if (words.length === 0 || expectedPattern.length === 0) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-4 text-center text-white/50">
                <p>Intonation data not available</p>
            </div>
        );
    }

    const chartWidth = Math.max(400, words.length * 60);
    const padding = { top: 30, right: 20, bottom: 40, left: 20 };
    const chartHeight = height - padding.top - padding.bottom;

    // Generate SVG paths
    const { expectedPath, userPath, points } = useMemo(() => {
        const xStep = (chartWidth - padding.left - padding.right) / Math.max(1, words.length - 1);

        const generatePath = (pattern: number[]) => {
            if (pattern.length === 0) return '';

            const pts = pattern.map((val, i) => ({
                x: padding.left + i * xStep,
                y: padding.top + chartHeight - (val * chartHeight)
            }));

            // Create smooth curve
            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) {
                const prev = pts[i - 1];
                const curr = pts[i];
                const cpx = (prev.x + curr.x) / 2;
                d += ` Q ${cpx} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
                if (i === pts.length - 1) {
                    d += ` Q ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
                }
            }
            return d;
        };

        const pts = words.map((_, i) => ({
            x: padding.left + i * xStep,
            expected: padding.top + chartHeight - (expectedPattern[i] || 0.5) * chartHeight,
            user: padding.top + chartHeight - (userPattern[i] || 0.5) * chartHeight
        }));

        return {
            expectedPath: generatePath(expectedPattern),
            userPath: generatePath(userPattern),
            points: pts
        };
    }, [words, expectedPattern, userPattern, chartWidth, chartHeight]);

    // Find key moment indices
    const keyMomentIndices = new Set(keyMoments.map(km => km.wordIndex));

    return (
        <div className="bg-slate-800/50 rounded-xl p-4">
            <div className="flex items-center gap-4 mb-3 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-orange-400 rounded" />
                    <span className="text-white/70">Native</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-emerald-400 rounded" />
                    <span className="text-white/70">You</span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <svg
                    width={chartWidth}
                    height={height}
                    className="min-w-full"
                >
                    {/* Grid lines */}
                    <line
                        x1={padding.left}
                        y1={padding.top}
                        x2={chartWidth - padding.right}
                        y2={padding.top}
                        stroke="rgba(255,255,255,0.1)"
                        strokeDasharray="4"
                    />
                    <line
                        x1={padding.left}
                        y1={padding.top + chartHeight / 2}
                        x2={chartWidth - padding.right}
                        y2={padding.top + chartHeight / 2}
                        stroke="rgba(255,255,255,0.1)"
                        strokeDasharray="4"
                    />
                    <line
                        x1={padding.left}
                        y1={padding.top + chartHeight}
                        x2={chartWidth - padding.right}
                        y2={padding.top + chartHeight}
                        stroke="rgba(255,255,255,0.1)"
                        strokeDasharray="4"
                    />

                    {/* Labels */}
                    <text x={5} y={padding.top + 4} fill="rgba(255,255,255,0.5)" fontSize="10">Rising</text>
                    <text x={5} y={padding.top + chartHeight} fill="rgba(255,255,255,0.5)" fontSize="10">Falling</text>

                    {/* Expected pattern line */}
                    <path
                        d={expectedPath}
                        fill="none"
                        stroke="#fb923c"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* User pattern line */}
                    <path
                        d={userPath}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* Data points */}
                    {points.map((pt, i) => (
                        <g key={i}>
                            {/* Expected point */}
                            <circle
                                cx={pt.x}
                                cy={pt.expected}
                                r={4}
                                fill="#fb923c"
                            />
                            {/* User point */}
                            <circle
                                cx={pt.x}
                                cy={pt.user}
                                r={4}
                                fill="#34d399"
                            />
                            {/* Highlight key moments with divergence */}
                            {keyMomentIndices.has(i) && (
                                <circle
                                    cx={pt.x}
                                    cy={pt.user}
                                    r={8}
                                    fill="none"
                                    stroke="#f87171"
                                    strokeWidth="2"
                                    strokeDasharray="3"
                                />
                            )}
                        </g>
                    ))}

                    {/* Word labels */}
                    {words.map((word, i) => (
                        <text
                            key={i}
                            x={points[i]?.x || 0}
                            y={height - 10}
                            textAnchor="middle"
                            fill={keyMomentIndices.has(i) ? '#f87171' : 'rgba(255,255,255,0.7)'}
                            fontSize="12"
                            fontWeight={keyMomentIndices.has(i) ? 'bold' : 'normal'}
                        >
                            {word}
                        </text>
                    ))}
                </svg>
            </div>

            {/* Key moments legend */}
            {keyMoments.length > 0 && (
                <div className="mt-3 space-y-1">
                    {keyMoments.filter(km => !km.correct).map((km, i) => (
                        <div key={i} className="text-sm text-red-300 flex items-center gap-2">
                            <span className="text-red-400">●</span>
                            <span>
                                &quot;{km.word}&quot; - expected {km.expected}, you said {km.actual}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
