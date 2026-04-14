'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
    RefreshCw,
    Play,
    Download,
    CheckCircle,
    XCircle,
    Clock,
    Loader2,
    ArrowLeft,
    Zap,
    BookOpen,
    Target,
    Sparkles,
    AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

interface BatchJob {
    id: string;
    batchId: string;
    name: string;
    type: string;
    status: string;
    requestCount: number;
    successCount: number;
    failCount: number;
    submittedAt: string;
    completedAt: string;
    error?: string;
}

interface ExerciseStat {
    userId: string;
    date: string;
    questionCount: number;
    drillCount: number;
    hasImmersive: boolean;
    hasBundle: boolean;
    generatedAt: string;
    used: boolean;
}

interface Summary {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    usersWithExercises: number;
    totalQuestions: number;
    totalDrills: number;
}

export default function BatchStatusPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [jobs, setJobs] = useState<BatchJob[]>([]);
    const [exercises, setExercises] = useState<ExerciseStat[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [triggering, setTriggering] = useState<string | null>(null);
    const [triggerResult, setTriggerResult] = useState<any>(null);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        if (!authLoading && (!user || !isAdmin)) {
            router.push('/feed');
        }
    }, [user, authLoading, isAdmin, router]);

    const fetchStatus = useCallback(async () => {
        if (!user?.email) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/batch-status', {
                headers: { 'x-user-email': user.email },
            });
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs || []);
                setExercises(data.todaysExercises || []);
                setSummary(data.summary || null);
            }
        } catch (err) {
            console.error('Failed to fetch batch status:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (isAdmin) fetchStatus();
    }, [isAdmin, fetchStatus]);

    const handleTrigger = async (action: 'trigger-import' | 'trigger-collect') => {
        if (!user?.email || triggering) return;
        setTriggering(action);
        setTriggerResult(null);
        try {
            const res = await fetch('/api/admin/batch-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user.email,
                },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            setTriggerResult(data);
            // Refresh after trigger
            setTimeout(fetchStatus, 2000);
        } catch (err) {
            console.error('Trigger failed:', err);
            setTriggerResult({ error: 'Request failed' });
        } finally {
            setTriggering(null);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'creating':
            case 'submitted':
            case 'processing': return <Clock className="w-4 h-4 text-amber-500" />;
            default: return <Clock className="w-4 h-4 text-neutral-400" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'failed': return 'bg-red-50 text-red-700 border-red-200';
            case 'creating':
            case 'submitted':
            case 'processing': return 'bg-amber-50 text-amber-700 border-amber-200';
            default: return 'bg-neutral-50 text-neutral-600 border-neutral-200';
        }
    };

    const formatTime = (ts: string) => {
        if (!ts) return '—';
        try {
            const d = new Date(ts);
            return d.toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return ts; }
    };

    if (authLoading || (!isAdmin && !authLoading)) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Link href="/admin" className="text-neutral-400 hover:text-neutral-600 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900" style={{ fontFamily: 'var(--font-serif, Georgia), serif' }}>
                            Batch Pipeline
                        </h1>
                        <p className="text-sm text-neutral-500 mt-0.5">Monitor batch jobs & pre-generated exercises</p>
                    </div>
                </div>
                <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white border border-neutral-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                            </div>
                        </div>
                        <p className="text-2xl font-semibold text-neutral-900">{summary.completedJobs}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">Completed Jobs</p>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                <Target className="w-4 h-4 text-blue-500" />
                            </div>
                        </div>
                        <p className="text-2xl font-semibold text-neutral-900">{summary.usersWithExercises}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">Users with Exercises Today</p>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                                <BookOpen className="w-4 h-4 text-violet-500" />
                            </div>
                        </div>
                        <p className="text-2xl font-semibold text-neutral-900">{summary.totalQuestions}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">Questions Generated</p>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-amber-500" />
                            </div>
                        </div>
                        <p className="text-2xl font-semibold text-neutral-900">{summary.totalDrills}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">Drills Generated</p>
                    </div>
                </div>
            )}

            {/* Trigger Buttons */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-8">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider mb-4">Manual Triggers</h2>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => handleTrigger('trigger-import')}
                        disabled={!!triggering}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-all disabled:opacity-50"
                    >
                        {triggering === 'trigger-import' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4" />
                        )}
                        Run Daily Import
                    </button>
                    <button
                        onClick={() => handleTrigger('trigger-collect')}
                        disabled={!!triggering}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-all disabled:opacity-50"
                    >
                        {triggering === 'trigger-collect' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        Collect Results
                    </button>
                </div>

                {/* Trigger Result */}
                {triggerResult && (
                    <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <pre className="text-xs text-neutral-700 whitespace-pre-wrap overflow-auto max-h-40">
                            {JSON.stringify(triggerResult, null, 2)}
                        </pre>
                    </div>
                )}
            </div>

            {/* Batch Jobs Table */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-8">
                <div className="px-5 py-4 border-b border-neutral-100">
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Recent Batch Jobs</h2>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-12 text-sm text-neutral-400">
                        No batch jobs found
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100">
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Type</th>
                                    <th className="px-5 py-3 font-medium">Requests</th>
                                    <th className="px-5 py-3 font-medium">Success</th>
                                    <th className="px-5 py-3 font-medium">Failed</th>
                                    <th className="px-5 py-3 font-medium">Submitted</th>
                                    <th className="px-5 py-3 font-medium">Completed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map((job) => (
                                    <tr key={job.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusColor(job.status)}`}>
                                                {getStatusIcon(job.status)}
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-neutral-700">
                                            <span className="font-medium">{job.type || job.name || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-neutral-600 tabular-nums">{job.requestCount}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-emerald-600 tabular-nums font-medium">{job.successCount}</span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {job.failCount > 0 ? (
                                                <span className="text-red-600 tabular-nums font-medium">{job.failCount}</span>
                                            ) : (
                                                <span className="text-neutral-300">0</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-neutral-500 text-xs">{formatTime(job.submittedAt)}</td>
                                        <td className="px-5 py-3.5 text-neutral-500 text-xs">{formatTime(job.completedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Today's Pre-generated Exercises */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">
                        Today&apos;s Pre-generated Exercises
                    </h2>
                    <span className="text-xs text-neutral-400">
                        {new Date().toISOString().split('T')[0]}
                    </span>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                ) : exercises.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                            <Sparkles className="w-5 h-5 text-neutral-400" />
                        </div>
                        <p className="text-sm text-neutral-500">No exercises generated today yet</p>
                        <p className="text-xs text-neutral-400 mt-1">Run Daily Import → wait → Collect Results</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100">
                                    <th className="px-5 py-3 font-medium">User</th>
                                    <th className="px-5 py-3 font-medium">Questions</th>
                                    <th className="px-5 py-3 font-medium">Drills</th>
                                    <th className="px-5 py-3 font-medium">Immersive</th>
                                    <th className="px-5 py-3 font-medium">Bundle</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Generated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exercises.map((ex, i) => (
                                    <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <span className="text-neutral-700 font-mono text-xs">{ex.userId.slice(0, 12)}…</span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`tabular-nums font-medium ${ex.questionCount > 0 ? 'text-emerald-600' : 'text-neutral-300'}`}>
                                                {ex.questionCount}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`tabular-nums font-medium ${ex.drillCount > 0 ? 'text-blue-600' : 'text-neutral-300'}`}>
                                                {ex.drillCount}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {ex.hasImmersive ? (
                                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <span className="text-neutral-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {ex.hasBundle ? (
                                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <span className="text-neutral-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {ex.used ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                                    Used
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Ready
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-neutral-500 text-xs">{formatTime(ex.generatedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
