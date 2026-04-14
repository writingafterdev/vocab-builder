'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, BookOpen, PenLine, Zap, Check } from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';

// ─── Module definitions for the progress path ──────────

const MODULES = [
    {
        id: 'cohesion',
        label: 'Structure',
        description: 'Flow & connection',
        icon: BookOpen,
    },
    {
        id: 'naturalness',
        label: 'Expression',
        description: 'Tone & vocabulary',
        icon: PenLine,
    },
    {
        id: 'task_achievement',
        label: 'Logic',
        description: 'Reasoning & evidence',
        icon: Zap,
    },
];

// ─── Main Content ─────────────────────────────────────

function PracticePageContent() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [generating, setGenerating] = useState(false);
    const [pastSessions, setPastSessions] = useState<Array<{
        id: string; title: string; status: string; totalPhrases: number; questionCount: number;
    }>>([]);
    const [duePhraseCount, setDuePhraseCount] = useState<number | null>(null);

    const userId = user?.$id;

    // Auth bounce
    useEffect(() => {
        if (!authLoading && !user) {
            toast('Please log in to practice', { icon: '🔒' });
            router.push('/auth/login');
        }
    }, [user, authLoading, router]);

    // Fetch sessions & due phrase count
    useEffect(() => {
        if (!userId) return;

        fetch('/api/practice/list-sessions', { headers: { 'x-user-id': userId } })
            .then(res => res.ok ? res.json() : { sessions: [] })
            .then(data => setPastSessions((data.sessions || []).slice(0, 5)))
            .catch(() => {});

        fetch('/api/user/due-phrases', { headers: { 'x-user-id': userId } })
            .then(res => res.ok ? res.json() : { count: 0 })
            .then(data => setDuePhraseCount(data.phrases?.length || data.count || 0))
            .catch(() => {});
    }, [userId]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <EditorialLoader size="md" label="Loading" />
            </div>
        );
    }

    if (!user) return null;

    const completedSessions = pastSessions.filter(s => s.status?.startsWith('completed'));
    const inProgressSession = pastSessions.find(s => s.status === 'generated' || s.status === 'in_progress');

    const handleGenerate = async () => {
        if (!userId || generating) return;
        setGenerating(true);
        try {
            const { account } = await import('@/lib/appwrite/client');
            let token = null;
            try {
                const jwtRes = await account.createJWT();
                token = jwtRes.jwt;
            } catch(e) {}

            const res = await fetch('/api/practice/generate-session-article', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({}),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to generate');
            }

            const data = await res.json();
            router.push(`/practice/session/${data.sessionId}`);
        } catch (err: any) {
            console.error('Generate failed:', err);
            toast.error(err.message || 'Failed to generate session');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto px-5 pt-8 pb-20">
            {/* ── Header ── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                className="mb-10"
            >
                <h1
                    className="text-3xl text-[var(--foreground)] mb-2"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    Practice
                </h1>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                    {duePhraseCount !== null && duePhraseCount > 0
                        ? `${duePhraseCount} phrase${duePhraseCount > 1 ? 's' : ''} due for review`
                        : 'Strengthen your understanding through contextual exercises'
                    }
                </p>
            </motion.div>

            {/* ── Continue or Start ── */}
            {inProgressSession && (
                <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    onClick={() => router.push(`/practice/session/${inProgressSession.id}`)}
                    className="
                        w-full flex items-center justify-between
                        px-5 py-4 mb-6
                        bg-[var(--foreground)] text-[var(--background)]
                        hover:opacity-90 transition-opacity
                    "
                >
                    <div className="text-left">
                        <p className="text-[11px] font-bold uppercase tracking-[0.15em] opacity-60 mb-1">
                            Continue session
                        </p>
                        <p className="text-sm font-medium">{inProgressSession.title}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-60" />
                </motion.button>
            )}

            {/* ── Vertical Progress Path (Elevate-style) ── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="mb-10"
            >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] mb-6">
                    Today's session
                </p>

                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--border)]" />

                    {MODULES.map((mod, i) => {
                        const Icon = mod.icon;
                        const isCompleted = completedSessions.length > i;
                        const isCurrent = completedSessions.length === i;

                        return (
                            <motion.div
                                key={mod.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.1, duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                                className="relative flex items-start gap-4 pb-8 last:pb-0"
                            >
                                {/* Node on the line */}
                                <div className={`
                                    relative z-10 flex items-center justify-center
                                    w-10 h-10 rounded-full border-2 shrink-0
                                    transition-all duration-300
                                    ${isCompleted
                                        ? 'bg-emerald-50 border-emerald-400'
                                        : isCurrent
                                            ? 'bg-[var(--foreground)] border-[var(--foreground)]'
                                            : 'bg-[var(--background)] border-[var(--border)]'
                                    }
                                `}>
                                    {isCompleted ? (
                                        <Check className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                        <Icon className={`w-4 h-4 ${
                                            isCurrent ? 'text-[var(--background)]' : 'text-[var(--muted-foreground)]'
                                        }`} />
                                    )}
                                </div>

                                {/* Label */}
                                <div className="pt-1.5">
                                    <p className={`text-sm font-medium ${
                                        isCompleted
                                            ? 'text-emerald-700'
                                            : isCurrent
                                                ? 'text-[var(--foreground)]'
                                                : 'text-[var(--muted-foreground)]'
                                    }`}>
                                        {mod.label}
                                    </p>
                                    <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                                        {mod.description}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>

            {/* ── Generate Button ── */}
            {duePhraseCount !== null && duePhraseCount === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                    className="w-full py-5 bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)] border border-[var(--border)] text-center"
                >
                    <p className="text-sm text-[var(--muted-foreground)] mb-1">No phrases due for review</p>
                    <p className="text-[11px] text-[var(--muted-foreground)] opacity-60">
                        Keep reading articles and saving new phrases — they'll appear here when due
                    </p>
                </motion.div>
            ) : (
                <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                    onClick={handleGenerate}
                    disabled={generating}
                    className="
                        w-full py-4
                        bg-[var(--foreground)] text-[var(--background)]
                        text-[11px] font-bold uppercase tracking-[0.2em]
                        hover:opacity-90 transition-opacity
                        disabled:opacity-40 disabled:cursor-not-allowed
                        flex items-center justify-center gap-2
                    "
                >
                    {generating ? (
                        <>
                            <span className="w-3.5 h-3.5 border-2 border-[var(--background)]/30 border-t-[var(--background)] rounded-full animate-spin" />
                            Generating...
                        </>
                    ) : (
                        <>Start Session <ArrowRight className="w-3.5 h-3.5" /></>
                    )}
                </motion.button>
            )}

            {/* ── Past Sessions ── */}
            {completedSessions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.3 }}
                    className="mt-10"
                >
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] mb-4">
                        Completed
                    </p>
                    <div className="space-y-1">
                        {completedSessions.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => router.push(`/practice/session/${s.id}`)}
                                className="
                                    w-full text-left flex items-center justify-between
                                    py-3 px-1
                                    hover:bg-[color-mix(in_oklch,var(--background),var(--foreground)_3%)]
                                    transition-colors
                                "
                            >
                                <div>
                                    <p className="text-sm text-[var(--foreground)]">{s.title}</p>
                                    <p className="text-[11px] text-[var(--muted-foreground)]">
                                        {s.totalPhrases} phrases · {s.questionCount} questions
                                    </p>
                                </div>
                                <span className="text-[10px] text-emerald-600 font-medium">Done</span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// ─── Page Wrapper ─────────────────────────────────────

export default function PracticePage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-[60vh]">
                <EditorialLoader size="sm" />
            </div>
        }>
            <ErrorBoundary>
                <PracticePageContent />
            </ErrorBoundary>
        </Suspense>
    );
}
