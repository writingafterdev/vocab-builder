'use client';

import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { getDuePhrasesbyType } from '@/lib/db/srs';
import type { SavedPhrase, ExerciseSession, ExerciseSessionType, SessionResult } from '@/lib/db/types';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';

// Import practice components
import JourneyPath from '@/components/practice/journey-path';
import ExerciseShell from '@/components/practice/exercise-shell';
import RightSidebar from '@/components/practice/right-sidebar';
import { DailyDrillBanner } from '@/components/practice/DailyDrillBanner';
import VocabArcade, { ArcadeResult } from '@/components/practice/vocab-arcade';

// Cluster interface for practice
interface PracticeCluster {
    id: string;
    theme: string;
    skill?: string;
    context: string;
    pragmatics: {
        register: string;
        relationship: string;
    };
    phrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
        learningStep?: number;
    }>;
}

// Local storage keys for daily progress
const DAILY_PROGRESS_KEY = 'daily_progress_v3';

interface DailyProgress {
    date: string;
    quickPracticeCompleted: boolean;
    storyCompleted: boolean;
    listeningCompleted: boolean;
    completedClusterIds: string[];
}

function getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
}

function loadDailyProgress(): DailyProgress {
    const defaultProgress: DailyProgress = {
        date: getTodayKey(),
        quickPracticeCompleted: false,
        storyCompleted: false,
        listeningCompleted: false,
        completedClusterIds: []
    };

    if (typeof window === 'undefined') {
        return defaultProgress;
    }

    try {
        const stored = localStorage.getItem(DAILY_PROGRESS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.date === getTodayKey()) {
                return { ...defaultProgress, ...parsed };
            }
        }
    } catch (e) { }

    return defaultProgress;
}

function saveDailyProgress(progress: DailyProgress) {
    if (typeof window !== 'undefined') {
        localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
    }
}

// Helper: Extract expressions for clustering
function extractExpressions(phrases: SavedPhrase[]): Array<any> {
    return phrases.map(p => ({
        id: p.id,
        phrase: p.phrase,
        meaning: p.meaning,
        tags: {
            topics: p.topics || (Array.isArray(p.topic) ? p.topic : [p.topic || 'General']),
            subtopic: p.subtopic,
            register: p.register,
            socialDistance: p.socialDistance
        },
        practiceHistory: p.practiceHistory,
        learningStep: p.learningStep || 0
    }));
}

// Persistent journey node from Firestore
interface JourneyNode {
    id: string; // Firestore doc ID
    clusterId: string;
    theme: string;
    skill?: string;
    context: string;
    pragmatics: { register: string; relationship: string };
    phrases: Array<{ id: string; phrase: string; meaning: string }>;
    order: number;
    completedAt: any;
    createdAt: any;
}

// Main Content Component
function PracticePageContent() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [loading, setLoading] = useState(true);
    const [clustering, setClustering] = useState(false);
    const [clusters, setClusters] = useState<PracticeCluster[]>([]);
    const [dailyProgress, setDailyProgress] = useState<DailyProgress>(loadDailyProgress());

    // Persistent journey path
    const [allNodes, setAllNodes] = useState<JourneyNode[]>([]);
    const [nodeIdMap, setNodeIdMap] = useState<Record<string, string>>({}); // clusterId → Firestore nodeId

    // Active session state
    const [activeSession, setActiveSession] = useState<ExerciseSession | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Cached completed sessions from Firestore
    const [completedSessions, setCompletedSessions] = useState<Record<string, ExerciseSession>>({});

    // Pre-generated exercises from batch
    const [preGenData, setPreGenData] = useState<any>(null);

    // Session eligibility
    const [immersiveEligible, setImmersiveEligible] = useState(false);

    // Daily Drill state
    const [showDrillPage, setShowDrillPage] = useState(false);

    // Arcade state
    const [isArcadeActive, setIsArcadeActive] = useState(false);

    // IMPORTANT: These hooks MUST be before any early returns to satisfy Rules of Hooks!
    const handleCloseArcade = useCallback(() => setIsArcadeActive(false), []);
    const allDuePhrases = useMemo(() => {
        return clusters.flatMap(c => c.phrases as SavedPhrase[]);
    }, [clusters]);

    // Guard against double-invocation (React Strict Mode / fast re-renders)
    const clusteringInProgress = useRef(false);

    // Arcade launch listener
    useEffect(() => {
        const handleLaunch = () => setIsArcadeActive(true);
        window.addEventListener('launch-arcade', handleLaunch);
        return () => window.removeEventListener('launch-arcade', handleLaunch);
    }, []);

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

    // Load clusters on mount
    useEffect(() => {
        if (!user) {
            if (!authLoading) setLoading(false);
            return;
        }
        loadJourneyPath();
        loadCompletedSessions();
        checkImmersiveEligibility();
        loadPreGeneratedExercises();
    }, [user]);

    // Load pre-generated exercises from batch
    async function loadPreGeneratedExercises() {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/user/pre-generated-exercises', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.available && data.data) {
                    setPreGenData(data.data);
                    console.log(`[Practice] Pre-generated exercises loaded: ${data.data.questions?.length || 0} questions`);
                }
            }
        } catch (error) {
            console.error('[Practice] Failed to load pre-generated:', error);
        }
    }

    // Check immersive session eligibility (Step 3+ DUE phrases)
    async function checkImmersiveEligibility() {
        if (!user) return;
        try {
            const res = await fetch('/api/immersive-session/eligible', {
                headers: {
                    'x-user-id': user.uid
                }
            });
            if (res.ok) {
                const data = await res.json();
                setImmersiveEligible(data.eligible);
            }
        } catch (error) {
            console.error('Failed to check immersive eligibility:', error);
        }
    }

    // Load completed sessions from Firestore
    async function loadCompletedSessions() {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const date = getTodayKey();
            const res = await fetch(`/api/user/get-sessions?date=${date}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                }
            });
            if (res.ok) {
                const data = await res.json();
                setCompletedSessions(data.sessions || {});
            }
        } catch (error) {
            console.error('Failed to load completed sessions:', error);
        }
    }

    async function loadJourneyPath() {
        if (!user) return;

        try {
            setLoading(true);
            const token = await user.getIdToken();

            // 1. Load all historical journey nodes from Firestore
            const nodesRes = await fetch('/api/user/get-journey-nodes', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                }
            });

            let historicalNodes: JourneyNode[] = [];
            const idMap: Record<string, string> = {};

            if (nodesRes.ok) {
                const nodesData = await nodesRes.json();
                historicalNodes = nodesData.nodes || [];

                // Build nodeIdMap: clusterId → Firestore doc id
                for (const node of historicalNodes) {
                    idMap[node.clusterId] = node.id;
                }
            }

            // 2. Get currently due phrases
            const dueMap = await getDuePhrasesbyType(user.uid);
            const allDue = [...dueMap.active, ...dueMap.passive];
            console.log(`[Practice] Due phrases: ${allDue.length}, Historical nodes: ${historicalNodes.length}`);

            // 3. Filter out phrases already covered by historical nodes
            // Match by phrase TEXT (case-insensitive) since IDs may differ between savedPhrases and journeyNode phrases
            const historicalPhraseTexts = new Set(
                historicalNodes.flatMap(n => n.phrases.map((p: any) => (p.phrase || '').toLowerCase()))
            );
            const newDuePhrases = allDue.filter(p => !historicalPhraseTexts.has((p.phrase || '').toLowerCase()));
            console.log(`[Practice] New phrases to cluster: ${newDuePhrases.length} (${historicalPhraseTexts.size} already covered)`);

            // 4. Cluster only NEW due phrases (if any)
            let newClusters: PracticeCluster[] = [];
            if (newDuePhrases.length > 0 && !clusteringInProgress.current) {
                clusteringInProgress.current = true;
                setClustering(true);

                const expressions = extractExpressions(newDuePhrases);
                const clusterRes = await fetch('/api/user/cluster-phrases', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.uid
                    },
                    body: JSON.stringify({ phrases: expressions })
                });

                if (clusterRes.ok) {
                    const clusterData = await clusterRes.json();
                    newClusters = clusterData.clusters.map((c: any) => ({
                        id: c.id,
                        theme: c.theme,
                        skill: c.skill,
                        context: c.context,
                        pragmatics: c.pragmatics,
                        phrases: c.phrases,
                    }));

                    // 5. Save new nodes to Firestore
                    if (newClusters.length > 0) {
                        try {
                            await fetch('/api/user/save-journey-nodes', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`,
                                    'x-user-id': user.uid
                                },
                                body: JSON.stringify({
                                    nodes: newClusters,
                                    startOrder: historicalNodes.length
                                })
                            });

                            // Reload to get the saved nodes with proper IDs
                            const refreshRes = await fetch('/api/user/get-journey-nodes', {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'x-user-id': user.uid
                                }
                            });
                            if (refreshRes.ok) {
                                const refreshData = await refreshRes.json();
                                historicalNodes = refreshData.nodes || [];
                                for (const node of historicalNodes) {
                                    idMap[node.clusterId] = node.id;
                                }
                            }
                        } catch (e) {
                            console.error('Failed to save journey nodes:', e);
                        }
                    }
                }
                setClustering(false);
                clusteringInProgress.current = false;
            }

            // 6. Set state: allNodes for persistent path, clusters for active due
            setAllNodes(historicalNodes);
            setNodeIdMap(idMap);

            // Build the cluster list from ALL nodes (historical + new)
            const allClusters: PracticeCluster[] = historicalNodes.map(n => ({
                id: n.clusterId,
                theme: n.theme,
                skill: n.skill,
                context: n.context,
                pragmatics: n.pragmatics,
                phrases: n.phrases,
            }));
            setClusters(allClusters);

            // Enrich daily progress with historically completed node cluster IDs
            const completedIds = historicalNodes
                .filter(n => n.completedAt)
                .map(n => n.clusterId);

            if (completedIds.length > 0) {
                const newProgress = { ...dailyProgress };
                const merged = new Set([...newProgress.completedClusterIds, ...completedIds]);
                newProgress.completedClusterIds = Array.from(merged);
                setDailyProgress(newProgress);
                saveDailyProgress(newProgress);
            }

        } catch (error) {
            console.error('Failed to load journey path:', error);
            toast.error('Failed to prepare practice session');
        } finally {
            setLoading(false);
            setClustering(false);
        }
    }

    const startSession = useCallback(async (clusterId: string, sessionType: ExerciseSessionType) => {
        if (!user || isGenerating) return;

        const cluster = clusters.find(c => c.id === clusterId);
        if (!cluster) return;

        setIsGenerating(true);

        try {
            const token = await user.getIdToken();
            const clusterPhraseIds = new Set(cluster.phrases.map(p => p.id));

            // Try pre-generated exercises first
            if (preGenData?.questions?.length > 0) {
                const matchingQuestions = preGenData.questions.filter((q: any) =>
                    q.targetPhraseIds?.some((id: string) => clusterPhraseIds.has(id))
                );

                if (matchingQuestions.length >= 2) {
                    console.log(`[Practice] Using ${matchingQuestions.length} pre-generated questions`);
                    const session: ExerciseSession = {
                        id: `session_${Date.now()}`,
                        userId: user.uid,
                        type: sessionType,
                        clusterId,
                        storyContext: { title: cluster.theme, setting: cluster.context || '', characters: [], narrative: '', paragraphs: [], segments: [] },
                        questions: matchingQuestions,
                        testedPhraseIds: cluster.phrases.map(p => p.id),
                        contextPhraseIds: [],
                        usagesIncluded: [],
                        status: 'in_progress',
                        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
                    };
                    setActiveSession(session);
                    setIsGenerating(false);
                    return;
                }
            }

            // Fallback: real-time generation
            const res = await fetch('/api/user/generate-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    sessionType,
                    testedPhrases: cluster.phrases,
                    contextPhrases: [],
                    clusterContext: {
                        theme: cluster.theme,
                        setting: cluster.context,
                        pragmatics: cluster.pragmatics
                    }
                })
            });

            if (!res.ok) {
                throw new Error('Failed to generate session');
            }

            const data = await res.json();

            const session: ExerciseSession = {
                id: `session_${Date.now()}`,
                userId: user.uid,
                type: sessionType,
                clusterId,
                storyContext: data.session.storyContext,
                questions: data.session.questions,
                testedPhraseIds: cluster.phrases.map(p => p.id),
                contextPhraseIds: [],
                usagesIncluded: data.usagesIncluded || [],
                status: 'in_progress',
                createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            };

            setActiveSession(session);

        } catch (error) {
            console.error('Failed to start session:', error);
            toast.error('Failed to generate exercise session');
        } finally {
            setIsGenerating(false);
        }
    }, [user, clusters, isGenerating, preGenData]);

    const handleSessionComplete = useCallback(async (result: SessionResult) => {
        // Update daily progress
        if (activeSession) {
            const newProgress = { ...dailyProgress };

            // Track completed cluster
            if (activeSession.clusterId && !newProgress.completedClusterIds.includes(activeSession.clusterId)) {
                newProgress.completedClusterIds = [...newProgress.completedClusterIds, activeSession.clusterId];
            }

            // Save the completed session to Firestore for future review (skip summary sessions)
            if (activeSession.clusterId !== 'summary' && user) {
                try {
                    const token = await user.getIdToken();
                    await fetch('/api/user/save-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'x-user-id': user.uid
                        },
                        body: JSON.stringify({
                            session: activeSession,
                            date: getTodayKey()
                        })
                    });
                    // Update local cache
                    setCompletedSessions(prev => ({
                        ...prev,
                        [activeSession.clusterId]: activeSession
                    }));

                    // Mark journey node as completed in Firestore
                    const nodeId = nodeIdMap[activeSession.clusterId];
                    if (nodeId) {
                        await fetch('/api/user/get-journey-nodes', {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                                'x-user-id': user.uid
                            },
                            body: JSON.stringify({ nodeId })
                        });

                        // Update local allNodes state
                        setAllNodes(prev => prev.map(n =>
                            n.id === nodeId ? { ...n, completedAt: Date.now() } : n
                        ));
                    }
                } catch (error) {
                    console.error('Failed to save session to Firestore:', error);
                }
            }
            // The auto-promotion of child expressions via /api/user/promote-usages
            // was deprecated in favor of manual saves by the user.

            // Legacy session type tracking
            if (activeSession.type === 'quick_practice') {
                newProgress.quickPracticeCompleted = true;
            } else if (activeSession.type === 'story') {
                newProgress.storyCompleted = true;
            } else if (activeSession.type === 'listening') {
                newProgress.listeningCompleted = true;
            }

            setDailyProgress(newProgress);
            saveDailyProgress(newProgress);
        }

        setActiveSession(null);

        // Show completion toast
        toast.success(
            `Session complete! +${result.totalXpEarned} XP (${result.accuracy}% accuracy)`
        );
    }, [activeSession, dailyProgress, user]);

    const handleClose = useCallback(() => {
        setActiveSession(null);
    }, []);

    const handleArcadeComplete = useCallback(async (result: ArcadeResult) => {
        setIsArcadeActive(false);

        // Optimistic UI Toast
        toast.success(`Arcade Complete! Score: ${result.score}`, {
            icon: '🏆',
            description: `Cleared ${result.correctIds.length} phrases.`
        });

        if (!user || (result.correctIds.length === 0 && result.incorrectIds.length === 0)) return;

        try {
            const token = await user.getIdToken();
            await fetch('/api/user/update-arcade-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    correctIds: result.correctIds,
                    incorrectIds: result.incorrectIds,
                    score: result.score,
                    date: getTodayKey()
                })
            });
            // We don't strictly need to await this or block the UI. 
            // The user assumes their progress is saved.
        } catch (error) {
            console.error('Failed to save arcade results:', error);
            toast.error('Failed to sync arcade results.');
        }

    }, [user]);

    const handleReviewSession = useCallback((clusterId: string) => {
        // Load the saved session from cache
        const savedSession = completedSessions[clusterId];
        if (savedSession) {
            // Reset session status for replay
            const reviewSession: ExerciseSession = {
                ...savedSession,
                id: `review_${Date.now()}`,
                status: 'in_progress',
            };
            setActiveSession(reviewSession);
        } else {
            toast.error('Session not found. It may have expired.');
        }
    }, [completedSessions]);

    const handleShowSummary = useCallback(async () => {
        if (!user || isGenerating) return;

        // Collect all phrases from all clusters (the daily review)
        const allPhrases = clusters.flatMap(c => c.phrases);

        if (allPhrases.length === 0) {
            toast.info('No phrases to review!');
            return;
        }

        setIsGenerating(true);

        try {
            const token = await user.getIdToken();

            // Generate a summary/review session with all phrases
            const res = await fetch('/api/user/generate-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.uid
                },
                body: JSON.stringify({
                    sessionType: 'quick_practice', // Use quick practice format for review
                    testedPhrases: allPhrases,
                    contextPhrases: [],
                    clusterContext: {
                        theme: 'Daily Review',
                        setting: 'A comprehensive review of all phrases practiced today.',
                        pragmatics: { register: 'mixed', relationship: 'general' }
                    }
                })
            });

            if (!res.ok) {
                throw new Error('Failed to generate summary session');
            }

            const data = await res.json();

            // Build summary session object
            const session: ExerciseSession = {
                id: `summary_${Date.now()}`,
                userId: user.uid,
                type: 'quick_practice',
                clusterId: 'summary',
                storyContext: data.session.storyContext,
                questions: data.session.questions,
                testedPhraseIds: allPhrases.map(p => p.id),
                contextPhraseIds: [],
                usagesIncluded: data.usagesIncluded || [],
                status: 'in_progress',
                createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            };

            setActiveSession(session);

        } catch (error) {
            console.error('Failed to start summary session:', error);
            toast.error('Failed to generate summary session');
        } finally {
            setIsGenerating(false);
        }
    }, [user, clusters, isGenerating]);

    // Loading state
    if (loading && !user) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <EditorialLoader size="sm" label="Checking authorization" />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <EditorialLoader size="md" label={clustering ? 'Organizing your practice' : 'Loading'} />
            </div>
        );
    }

    // Active session view - fullscreen exercise overlay
    if (activeSession) {
        return (
            <ExerciseShell
                session={activeSession}
                onComplete={handleSessionComplete}
                onClose={handleClose}
            />
        );
    }

    // Active Arcade view

    if (isArcadeActive) {
        return (
            <AnimatePresence>
                <VocabArcade
                    phrases={allDuePhrases}
                    onClose={handleCloseArcade}
                    onComplete={handleArcadeComplete}
                />
            </AnimatePresence>
        );
    }

    // Empty state
    if (clusters.length === 0 && allNodes.length === 0) {
        return (
            <div className="max-w-md mx-auto py-24 px-6 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                    <span className="text-4xl">🌱</span>
                </div>
                <h2
                    className="text-2xl font-normal text-neutral-900 mb-3"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    Your journey begins here
                </h2>
                <p className="text-neutral-500 text-sm mb-8 leading-relaxed">
                    You haven't saved any vocabulary yet. Discover interesting articles, highlight words you want to learn, and they'll appear here for practice.
                </p>
                <div className="flex flex-col w-full gap-3">
                    <button
                        onClick={() => router.push('/')}
                        className="w-full bg-neutral-900 text-white px-6 py-3.5 text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                    >
                        Find Articles to Read
                        <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => router.push('/vocab')}
                        className="w-full text-neutral-400 px-6 py-3 text-xs font-medium uppercase tracking-[0.08em] hover:text-neutral-600 transition-colors"
                    >
                        Browse Dictionary
                    </button>
                </div>
            </div>
        );
    } else if (clusters.length === 0) {
        return (
            <div className="max-w-md mx-auto py-16 px-4 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-3xl">✅</span>
                </div>
                <h2
                    className="text-xl font-normal text-neutral-900 mb-2"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    All caught up!
                </h2>
                <p className="text-neutral-400 text-sm mb-6">No phrases due for review right now.</p>
                <div className="flex gap-3">
                    <button
                        onClick={() => router.push('/')}
                        className="bg-neutral-900 text-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] hover:bg-neutral-800 transition-colors rounded-md"
                    >
                        Read More
                    </button>
                    <button
                        onClick={() => router.push('/vocab')}
                        className="bg-neutral-100 text-neutral-600 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] hover:bg-neutral-200 transition-colors rounded-md"
                    >
                        View Bank
                    </button>
                </div>
            </div>
        );
    }

    // Main view - 3 Column Layout (Path + Sidebar)
    return (
        <>
            {/* Generating Overlay */}
            {isGenerating && (
                <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <EditorialLoader size="lg" label="Generating your exercise" />
                </div>
            )}

            <div className="flex justify-center max-w-6xl mx-auto px-4 lg:px-8 gap-8">
                {/* Center Content - Path */}
                <div className="flex-1 max-w-2xl min-h-screen space-y-6 pt-10">
                    <JourneyPath
                        clusters={clusters}
                        dailyProgress={dailyProgress}
                        onStartSession={startSession}
                        onShowSummary={handleShowSummary}
                        onReviewSession={handleReviewSession}
                        isStarting={isGenerating}
                        immersiveEligible={immersiveEligible}
                    />
                </div>

                {/* Right Sidebar - Stats & Quests */}
                <RightSidebar />
            </div>

            {/* Floating Daily Drill Button */}
            <DailyDrillBanner
                onStartDrill={() => router.push('/practice/daily-drill')}
            />
        </>
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
