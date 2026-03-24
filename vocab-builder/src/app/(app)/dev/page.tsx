'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function DevToolsPage() {
    const { user } = useAuth();
    const [log, setLog] = useState<string[]>([]);
    const [loading, setLoading] = useState<string | null>(null);

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const run = async (label: string, fn: () => Promise<any>) => {
        if (!user?.$id) { addLog('❌ Not logged in'); return; }
        setLoading(label);
        try {
            const result = await fn();
            addLog(`✅ ${label}: ${JSON.stringify(result).slice(0, 200)}`);
        } catch (e: any) {
            addLog(`❌ ${label}: ${e.message}`);
        } finally {
            setLoading(null);
        }
    };

    const uid = user?.$id;
    const h = { 'Content-Type': 'application/json', 'x-user-id': uid! };

    const actions = [
        {
            group: 'Seed Data',
            color: 'emerald',
            items: [
                {
                    label: 'Seed 10 Phrases + Weaknesses',
                    desc: 'Adds 10 sample phrases and 4 grammar weaknesses to your account',
                    fn: () => fetch('/api/test/seed-phrases', { method: 'POST', headers: h }).then(r => r.json()),
                },
            ],
        },
        {
            group: 'Feed Quizzes',
            color: 'blue',
            items: [
                {
                    label: 'Pre-generate Feed Quizzes',
                    desc: 'Triggers the batch quiz generation (requires saved phrases)',
                    fn: () => fetch('/api/exercise/pre-generate-feed-quizzes', { method: 'POST', headers: h }).then(r => r.json()),
                },
            ],
        },

        {
            group: 'Cleanup',
            color: 'red',
            items: [
                {
                    label: 'Delete All Phrases',
                    desc: 'Wipes your entire vocab bank (good for resetting between test runs)',
                    fn: () => fetch('/api/user/delete-all-phrases', { method: 'DELETE', headers: h }).then(r => r.json()),
                },
            ],
        },
    ];

    const colorMap: Record<string, string> = {
        emerald: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800',
        blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800',
        violet: 'border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800',
        red: 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700',
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-mono">
            <div className="max-w-2xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">🔧 Dev Tools</h1>
                    <p className="text-neutral-400 text-sm mt-1">
                        {user ? `Logged in as ${user.email} · uid: ${uid?.slice(0, 12)}...` : '⚠️ Not logged in'}
                    </p>
                </div>

                <div className="space-y-6">
                    {actions.map(group => (
                        <div key={group.group}>
                            <p className="text-xs uppercase tracking-widest text-neutral-500 mb-2">{group.group}</p>
                            <div className="space-y-2">
                                {group.items.map(action => (
                                    <button
                                        key={action.label}
                                        onClick={() => run(action.label, action.fn)}
                                        disabled={loading !== null || !user}
                                        className={`w-full text-left px-4 py-3 border rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${colorMap[group.color]}`}
                                    >
                                        <div className="font-semibold text-sm">
                                            {loading === action.label ? '⏳ ' : ''}{action.label}
                                        </div>
                                        <div className="text-xs opacity-70 mt-0.5">{action.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Log */}
                {log.length > 0 && (
                    <div className="mt-8">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs uppercase tracking-widest text-neutral-500">Output</p>
                            <button onClick={() => setLog([])} className="text-xs text-neutral-600 hover:text-neutral-400">Clear</button>
                        </div>
                        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1 max-h-64 overflow-y-auto">
                            {log.map((l, i) => (
                                <p key={i} className="text-xs text-neutral-300 leading-relaxed">{l}</p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
