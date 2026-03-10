'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight } from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';

// Main Content Component
function PracticePageContent() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    // Auth bounce
    useEffect(() => {
        if (!authLoading && !user) {
            toast('Please log in to join the Practice Room', {
                icon: '🔒',
                description: 'We need to track your progress and vocabulary.',
            });
            router.push('/auth/login');
        }
    }, [user, authLoading, router]);

    if (authLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <EditorialLoader size="md" label="Loading" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <>
            <div className="flex justify-center max-w-2xl mx-auto px-4 lg:px-8 gap-8">
                <div className="flex-1 min-h-screen space-y-6 pt-10">
                    {/* Generated Article Session Card */}
                    <GenerateArticleCard userId={user.uid} />
                </div>
            </div>
        </>
    );
}

// ─── Generate Article Card ──────────────────

function GenerateArticleCard({ userId }: { userId?: string }) {
    const router = useRouter();
    const [generating, setGenerating] = useState(false);
    const [pastSessions, setPastSessions] = useState<Array<{
        id: string; title: string; status: string; totalPhrases: number; questionCount: number;
    }>>([]);

    useEffect(() => {
        if (!userId) return;
        fetch('/api/practice/list-sessions', {
            headers: { 'x-user-id': userId },
        })
            .then(res => res.ok ? res.json() : { sessions: [] })
            .then(data => setPastSessions((data.sessions || []).slice(0, 3)))
            .catch(() => {});
    }, [userId]);

    const handleGenerate = async () => {
        if (!userId || generating) return;
        setGenerating(true);
        try {
            const { initializeFirebase } = await import('@/lib/firebase');
            const { auth } = await initializeFirebase();
            const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;

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
            console.error('Generate article failed:', err);
            toast.error(err.message || 'Failed to generate practice article');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 rounded-sm">
                        ✦ New
                    </span>
                    <span className="text-xs text-neutral-400">AI-Generated Practice</span>
                </div>
                <h3
                    className="text-xl font-normal text-neutral-900 mb-2"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    Practice with a Generated Article
                </h3>
                <p className="text-sm text-neutral-500 mb-5 leading-relaxed">
                    We'll create a custom article using your due vocabulary phrases, with non-skippable comprehension questions embedded throughout.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full py-3.5 bg-neutral-900 text-white rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {generating ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Generating your article...
                        </>
                    ) : (
                        <>Generate Practice Article <ArrowRight className="w-4 h-4" /></>
                    )}
                </button>
            </div>

            {/* Past sessions */}
            {pastSessions.length > 0 && (
                <div className="border-t border-neutral-100 px-6 py-4">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mb-2 block">
                        Recent Sessions
                    </span>
                    <div className="space-y-2">
                        {pastSessions.map(s => (
                            <button
                                key={s.id}
                                onClick={() => router.push(`/practice/session/${s.id}`)}
                                className="w-full text-left flex items-center justify-between py-2 hover:bg-neutral-50 -mx-2 px-2 rounded transition-colors"
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm text-neutral-700 truncate block">{s.title}</span>
                                    <span className="text-[11px] text-neutral-400">
                                        {s.totalPhrases} phrases · {s.questionCount} questions
                                    </span>
                                </div>
                                {s.status === 'completed' ? (
                                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Done</span>
                                ) : (
                                    <ArrowRight className="w-3.5 h-3.5 text-neutral-300" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
// Page wrapper with Suspense + ErrorBoundary
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
