'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Target, Mic, BookOpen, Brain, MessageSquare, Zap } from 'lucide-react';

interface SessionRecord {
    date: string;
    type: 'open-ended' | 'turn-based';
    intonationAccuracy: number;
    phrasesUsed: number;
    phrasesTotal: number;
    languageFit: number;
    fluency: number;
}

interface PhraseStats {
    timesPrompted: number;
    timesUsed: number;
    avgIntonation: number;
}

interface WeeklyStats {
    weekStart: string;
    sessionsCompleted: number;
    avgIntonation: number;
    phrasesLearned: number;
}

interface ProgressData {
    sessions: SessionRecord[];
    phraseStats: Record<string, PhraseStats>;
    weeklyStats: WeeklyStats[];
    summary: {
        totalSessions: number;
        avgIntonation: number;
        avgPhrasesRetention: number;
        recentTrend: 'improving' | 'declining' | 'stable';
    };
}

// Skill-based progress data
interface SkillScore {
    level: number;
    trend: 'up' | 'down' | 'stable';
    weeklyChange: number;
}

interface SkillData {
    skills: {
        comprehension: SkillScore;
        production: SkillScore;
        interaction: SkillScore;
        retention: SkillScore;
    };
    summary: {
        overall: number;
        strongest: string;
        weakest: string;
        recommendation: string;
    };
}

// Mini chart component for inline trends
function SparkLine({ data, color = 'emerald' }: { data: number[]; color?: string }) {
    if (data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((val - min) / range) * 80 - 10;
        return `${x},${y}`;
    }).join(' ');

    const colorClass = color === 'purple' ? 'stroke-purple-400' : 'stroke-emerald-400';

    return (
        <svg viewBox="0 0 100 100" className="w-24 h-8">
            <polyline
                fill="none"
                className={colorClass}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
        </svg>
    );
}

// Circular progress component
function CircularProgress({ value, label, color = 'emerald' }: { value: number; label: string; color?: string }) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = circumference - (value / 100) * circumference;

    const colorClass = color === 'purple' ? 'stroke-purple-500' : 'stroke-emerald-500';
    const bgClass = color === 'purple' ? 'stroke-purple-900' : 'stroke-emerald-900';

    return (
        <div className="flex flex-col items-center">
            <svg width="100" height="100" className="transform -rotate-90">
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    className={bgClass}
                    strokeWidth="8"
                />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    className={colorClass}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={progress}
                    strokeLinecap="round"
                />
            </svg>
            <span className="text-2xl font-bold text-white -mt-16">{Math.round(value)}%</span>
            <span className="text-sm text-white/60 mt-8">{label}</span>
        </div>
    );
}

export default function ProgressPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [skillData, setSkillData] = useState<SkillData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || !user) return;

        async function loadProgress() {
            try {
                const token = await user!.getIdToken();

                // Fetch both skill and speaking progress in parallel
                const [skillRes, speakingRes] = await Promise.all([
                    fetch('/api/user/get-skills', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'x-user-id': user!.uid
                        }
                    }),
                    fetch('/api/user/speaking-progress', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'x-user-id': user!.uid
                        }
                    })
                ]);

                if (skillRes.ok) {
                    const data = await skillRes.json();
                    setSkillData(data);
                }

                if (speakingRes.ok) {
                    const data = await speakingRes.json();
                    setProgress(data);
                }
            } catch (e) {
                console.error('Failed to load progress:', e);
            } finally {
                setLoading(false);
            }
        }

        loadProgress();
    }, [user, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const trendIcon = progress?.summary.recentTrend === 'improving'
        ? <TrendingUp className="w-5 h-5 text-emerald-400" />
        : progress?.summary.recentTrend === 'declining'
            ? <TrendingDown className="w-5 h-5 text-red-400" />
            : <Minus className="w-5 h-5 text-white/50" />;

    const trendText = progress?.summary.recentTrend === 'improving'
        ? 'Improving!'
        : progress?.summary.recentTrend === 'declining'
            ? 'Needs work'
            : 'Stable';

    // Extract trend data
    const intonationTrend = progress?.sessions.slice(-10).map(s => s.intonationAccuracy * 100) || [];
    const retentionTrend = progress?.sessions.slice(-10).map(s => (s.phrasesUsed / s.phrasesTotal) * 100) || [];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
            {/* Header */}
            <div className="max-w-4xl mx-auto mb-8">
                <button
                    onClick={() => router.push('/practice')}
                    className="flex items-center gap-2 text-white/70 hover:text-white mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Practice
                </button>
                <h1 className="text-3xl font-bold text-white">Learning Progress</h1>
                <p className="text-white/60">Track your improvement across all skills</p>
            </div>

            {/* Skills Section - Always visible */}
            {skillData && (
                <div className="max-w-4xl mx-auto mb-8">
                    {/* Skill Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        {/* Comprehension */}
                        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 backdrop-blur rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen className="w-5 h-5 text-blue-400" />
                                <span className="text-sm font-medium text-white">Comprehension</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-blue-400">{Math.round(skillData.skills.comprehension.level)}</span>
                                <span className="text-white/50 text-sm mb-1">/100</span>
                                {skillData.skills.comprehension.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />}
                                {skillData.skills.comprehension.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400 mb-1" />}
                            </div>
                            <div className="mt-2 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${skillData.skills.comprehension.level}%` }} />
                            </div>
                        </div>

                        {/* Production */}
                        <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 backdrop-blur rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Mic className="w-5 h-5 text-emerald-400" />
                                <span className="text-sm font-medium text-white">Production</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-emerald-400">{Math.round(skillData.skills.production.level)}</span>
                                <span className="text-white/50 text-sm mb-1">/100</span>
                                {skillData.skills.production.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />}
                                {skillData.skills.production.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400 mb-1" />}
                            </div>
                            <div className="mt-2 h-1.5 bg-emerald-900/50 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${skillData.skills.production.level}%` }} />
                            </div>
                        </div>

                        {/* Interaction */}
                        <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 backdrop-blur rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="w-5 h-5 text-amber-400" />
                                <span className="text-sm font-medium text-white">Interaction</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-amber-400">{Math.round(skillData.skills.interaction.level)}</span>
                                <span className="text-white/50 text-sm mb-1">/100</span>
                                {skillData.skills.interaction.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />}
                                {skillData.skills.interaction.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400 mb-1" />}
                            </div>
                            <div className="mt-2 h-1.5 bg-amber-900/50 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${skillData.skills.interaction.level}%` }} />
                            </div>
                        </div>

                        {/* Retention */}
                        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 backdrop-blur rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Brain className="w-5 h-5 text-purple-400" />
                                <span className="text-sm font-medium text-white">Retention</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-bold text-purple-400">{Math.round(skillData.skills.retention.level)}</span>
                                <span className="text-white/50 text-sm mb-1">/100</span>
                                {skillData.skills.retention.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />}
                                {skillData.skills.retention.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400 mb-1" />}
                            </div>
                            <div className="mt-2 h-1.5 bg-purple-900/50 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${skillData.skills.retention.level}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Recommendation Banner */}
                    <div className="bg-white/5 backdrop-blur rounded-xl p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-white/60">Focus on <span className="text-amber-400 font-medium capitalize">{skillData.summary.weakest}</span></div>
                            <div className="text-white">{skillData.summary.recommendation}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white">{skillData.summary.overall}</div>
                            <div className="text-xs text-white/50">Overall</div>
                        </div>
                    </div>
                </div>
            )}

            {/* No speaking data state */}
            {(!progress || progress.summary.totalSessions === 0) && (
                <div className="max-w-4xl mx-auto text-center py-16">
                    <div className="text-6xl mb-4">📊</div>
                    <h2 className="text-xl font-bold text-white mb-2">No Speaking Data Yet</h2>
                    <p className="text-white/60 mb-6">Complete some speaking sessions to see detailed progress!</p>
                    <Button onClick={() => router.push('/practice')}>
                        Start Practicing
                    </Button>
                </div>
            )}

            {progress && progress.summary.totalSessions > 0 && (
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/5 backdrop-blur rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-white">{progress.summary.totalSessions}</div>
                            <div className="text-sm text-white/60">Sessions</div>
                        </div>
                        <div className="bg-white/5 backdrop-blur rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-emerald-400">
                                {Math.round(progress.summary.avgIntonation * 100)}%
                            </div>
                            <div className="text-sm text-white/60">Avg Intonation</div>
                        </div>
                        <div className="bg-white/5 backdrop-blur rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-purple-400">
                                {Math.round(progress.summary.avgPhrasesRetention * 100)}%
                            </div>
                            <div className="text-sm text-white/60">Phrase Retention</div>
                        </div>
                        <div className="bg-white/5 backdrop-blur rounded-xl p-4 text-center flex flex-col items-center justify-center">
                            <div className="flex items-center gap-2">
                                {trendIcon}
                                <span className="text-lg font-medium text-white">{trendText}</span>
                            </div>
                            <div className="text-sm text-white/60">Trend</div>
                        </div>
                    </div>

                    {/* Progress Circles */}
                    <div className="bg-white/5 backdrop-blur rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-6">Overall Performance</h3>
                        <div className="flex justify-around">
                            <CircularProgress
                                value={progress.summary.avgIntonation * 100}
                                label="Intonation"
                                color="emerald"
                            />
                            <CircularProgress
                                value={progress.summary.avgPhrasesRetention * 100}
                                label="Retention"
                                color="purple"
                            />
                        </div>
                    </div>

                    {/* Trend Charts */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white/5 backdrop-blur rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Mic className="w-4 h-4" />
                                    Intonation Trend
                                </h3>
                                <SparkLine data={intonationTrend} color="emerald" />
                            </div>
                            <p className="text-sm text-white/60">Last 10 sessions</p>
                        </div>
                        <div className="bg-white/5 backdrop-blur rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Target className="w-4 h-4" />
                                    Phrase Retention
                                </h3>
                                <SparkLine data={retentionTrend} color="purple" />
                            </div>
                            <p className="text-sm text-white/60">Last 10 sessions</p>
                        </div>
                    </div>

                    {/* Recent Sessions */}
                    <div className="bg-white/5 backdrop-blur rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            Recent Sessions
                        </h3>
                        <div className="space-y-3">
                            {progress.sessions.slice(-5).reverse().map((session, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                                    <div>
                                        <span className="text-white font-medium capitalize">{session.type.replace('-', ' ')}</span>
                                        <span className="text-white/50 text-sm ml-2">
                                            {new Date(session.date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-emerald-400">
                                            {Math.round(session.intonationAccuracy * 100)}% intonation
                                        </span>
                                        <span className="text-purple-400">
                                            {session.phrasesUsed}/{session.phrasesTotal} phrases
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Weekly Stats */}
                    {progress.weeklyStats.length > 0 && (
                        <div className="bg-white/5 backdrop-blur rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Weekly Progress</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {progress.weeklyStats.slice(-4).map((week, i) => (
                                    <div key={i} className="text-center">
                                        <div className="text-xs text-white/50 mb-1">
                                            Week of {new Date(week.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="text-xl font-bold text-white">{week.sessionsCompleted}</div>
                                        <div className="text-xs text-white/60">sessions</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
