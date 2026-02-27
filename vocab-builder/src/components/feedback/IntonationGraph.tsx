'use client';

/**
 * IntonationGraph - Line chart comparing expected vs user pitch pattern
 * Uses Recharts LineChart
 */

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';
import { IntonationData } from '@/lib/speaking-feedback';

interface IntonationGraphProps {
    intonation: IntonationData;
}

export function IntonationGraph({ intonation }: IntonationGraphProps) {
    if (intonation.words.length === 0) {
        return (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-medium text-slate-600 mb-2">Intonation Pattern</h4>
                <p className="text-slate-400 text-sm">No intonation data available</p>
            </div>
        );
    }

    // Build data array for chart
    const data = intonation.words.map((word, index) => ({
        word,
        expected: intonation.expectedPattern[index] || 0.5,
        actual: intonation.userPattern[index] || 0.5,
    }));

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-medium text-slate-600 mb-4">Intonation Pattern</h4>

            <div className="w-full h-40">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                        <XAxis
                            dataKey="word"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                            domain={[0, 1]}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={{ stroke: '#e2e8f0' }}
                            tickCount={3}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        />
                        <Legend
                            iconSize={10}
                            wrapperStyle={{ fontSize: '11px' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="expected"
                            name="Expected"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="actual"
                            name="Your pattern"
                            stroke="#0d9488"
                            strokeWidth={2}
                            dot={{ fill: '#0d9488', strokeWidth: 0, r: 3 }}
                            activeDot={{ r: 5, fill: '#0d9488' }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <p className="text-xs text-slate-400 mt-2">
                Higher = rising pitch, Lower = falling pitch
            </p>
        </div>
    );
}
