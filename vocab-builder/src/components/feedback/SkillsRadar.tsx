'use client';

/**
 * SkillsRadar - Pentagon chart showing 5 speaking skills
 * Uses Recharts RadarChart
 */

import {
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer
} from 'recharts';

interface SkillsRadarProps {
    skills: {
        pronunciation: { score: number };
        fluency: { score: number };
        vocabulary: number;
        grammar: { score: number };
        connectedSpeech: { score: number };
    };
}

export function SkillsRadar({ skills }: SkillsRadarProps) {
    const data = [
        { skill: 'Pronunciation', value: skills.pronunciation.score, fullMark: 100 },
        { skill: 'Fluency', value: skills.fluency.score, fullMark: 100 },
        { skill: 'Vocabulary', value: skills.vocabulary, fullMark: 100 },
        { skill: 'Grammar', value: skills.grammar.score, fullMark: 100 },
        { skill: 'Connected Speech', value: skills.connectedSpeech.score, fullMark: 100 },
    ];

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis
                        dataKey="skill"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickCount={5}
                    />
                    <Radar
                        name="Skills"
                        dataKey="value"
                        stroke="#0d9488"
                        fill="#ccfbf1"
                        fillOpacity={0.6}
                        strokeWidth={2}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
