'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    BookOpen,
    Trash2,
    ChevronRight,
    Sparkles,
    Pencil,
    Loader2,
    MessageSquare,
    X,
    Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { TOPIC_OPTIONS, TopicValue } from '@/lib/db/types';

interface ChildExpression {
    type: 'collocation' | 'phrasal_verb';
    phrase: string;
    meaning: string;
    example?: string;  // AI-generated example sentence
    mode: 'spoken' | 'written' | 'neutral';
    topics: string[];
}

interface Phrase {
    id: string;
    phrase: string;
    meaning: string;
    context: string;
    sourceTitle: string;
    createdAt: Date;
    showCount: number;      // SRS reviews
    practiceCount: number;  // On-demand practice
    nextShowAt: Date | null;
    retired: boolean;
    topics?: TopicValue[];
    children?: ChildExpression[];  // Hierarchical children
    mode?: 'spoken' | 'written' | 'neutral';  // Debate style
}

interface PhraseCluster {
    topic: string;
    phrases: Array<{
        phraseId: string;
        phrase: string;
        meaning: string;
    }>;
}

interface PendingDebate {
    id: string;
    topic: string;
    phrases: Array<{ phrase: string; meaning: string }>;
    batchId: string;
    createdAt: string;
}

// Helper: Extract expressions to practice from Phrases
// ALWAYS includes root word + all children (collocations/phrasal verbs)
function extractPracticeExpressions(phrases: Phrase[]): Array<{
    phraseId: string;
    phrase: string;
    meaning: string;
}> {
    const expressions: Array<{ phraseId: string; phrase: string; meaning: string }> = [];

    for (const p of phrases) {
        // Always include root word
        expressions.push({
            phraseId: p.id,
            phrase: p.phrase,
            meaning: p.meaning,
        });

        // Also include all children
        if (p.children && p.children.length > 0) {
            for (const child of p.children) {
                expressions.push({
                    phraseId: p.id, // Link back to parent for SRS updates
                    phrase: child.phrase,
                    meaning: child.meaning,
                });
            }
        }
    }

    return expressions;
}

function PhraseCard({
    phrase,
    onDelete,
    selected,
    onToggleSelect
}: {
    phrase: Phrase;
    onDelete: (id: string) => void;
    selected: boolean;
    onToggleSelect: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric'
        }).format(date);
    };

    const getShowCountColor = () => {
        if (phrase.showCount === 0) return 'text-emerald-500 font-medium';
        if (phrase.showCount <= 2) return 'text-blue-500';
        if (phrase.showCount <= 4) return 'text-violet-500';
        return 'text-amber-600 font-medium';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            layout
        >
            <div className={`group relative bg-white border rounded-xl overflow-hidden hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-300 ${selected ? 'border-green-300 bg-green-50/30' : 'border-neutral-100/80 hover:border-neutral-200'
                }`}>
                <div className="p-5">
                    <div className="flex items-start gap-4">
                        <Checkbox
                            checked={selected}
                            onCheckedChange={() => onToggleSelect(phrase.id)}
                            className="mt-1.5 h-5 w-5 rounded-md border-neutral-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 transition-all duration-200"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-4 mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-serif font-medium text-2xl text-neutral-900 leading-tight tracking-tight">
                                        {phrase.phrase}
                                    </h3>
                                    {phrase.mode && phrase.mode !== 'neutral' && (
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] font-sans ${phrase.mode === 'spoken'
                                                ? 'border-purple-300 text-purple-600 bg-purple-50'
                                                : 'border-blue-300 text-blue-600 bg-blue-50'
                                                }`}
                                        >
                                            {phrase.mode === 'spoken' ? '💬 Casual' : '✍️ Formal'}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <p className="text-neutral-600 text-[15px] font-sans leading-relaxed mb-3">
                                {phrase.meaning}
                            </p>

                            {phrase.context && (
                                <div className="mb-4 pl-3 border-l-2 border-neutral-100">
                                    <p className="text-neutral-400 font-serif italic text-sm leading-relaxed line-clamp-2">
                                        "{phrase.context}"
                                    </p>
                                </div>
                            )}

                            {/* Stats Footer */}
                            <div className="flex items-center gap-4 text-xs text-neutral-400 font-medium tracking-wide font-sans mt-4">
                                <div className="flex items-center gap-1.5" title="Added Date">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span>{formatDate(phrase.createdAt)}</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${phrase.practiceCount > 0 ? 'text-emerald-600' : ''}`} title="Practice Count">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{phrase.practiceCount}</span>
                                </div>
                                <div className={`flex items-center gap-1.5 ${phrase.showCount > 0 ? 'text-blue-600' : ''}`} title="Review Count">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{phrase.showCount}</span>
                                </div>
                            </div>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-all duration-200">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-full"
                                onClick={() => onDelete(phrase.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Collapsible Child Expressions Section */}
                {phrase.children && phrase.children.length > 0 && (
                    <div className="bg-neutral-50/50 border-t border-neutral-100">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors group/toggle"
                        >
                            <div className="flex items-center gap-2">
                                <span className="uppercase tracking-wider">Related Expressions</span>
                                <span className="bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded-full text-[10px]">
                                    {phrase.children.length}
                                </span>
                            </div>
                            <svg
                                className={`w-4 h-4 text-neutral-400 group-hover/toggle:text-neutral-600 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        <AnimatePresence>
                            {expanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-5 pb-4 space-y-2">
                                        {phrase.children.map((child, idx) => (
                                            <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-neutral-100 hover:border-neutral-200 transition-colors">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0 mt-0.5 ${child.type === 'phrasal_verb'
                                                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                    : 'bg-amber-50 text-amber-600 border border-amber-100'
                                                    }`}>
                                                    {child.type === 'phrasal_verb' ? 'PV' : 'Col'}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-neutral-800 leading-snug">{child.phrase}</p>
                                                    <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{child.meaning}</p>
                                                    {/* Example sentence */}
                                                    {child.example && (
                                                        <p className="text-xs italic text-neutral-400 mt-1">"{child.example}"</p>
                                                    )}
                                                    {/* Topics for this child expression */}
                                                    {child.topics && child.topics.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {child.topics.map(topic => {
                                                                const topicInfo = TOPIC_OPTIONS.find(t => t.value === topic);
                                                                return (
                                                                    <span
                                                                        key={topic}
                                                                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-medium"
                                                                    >
                                                                        {topicInfo?.label || topic}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function SkeletonCard() {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="space-y-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </CardContent>
        </Card>
    );
}

export default function VocabBankPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [phrases, setPhrases] = useState<Phrase[]>([]);
    const [loading, setLoading] = useState(true);
    const [clustering, setClustering] = useState(false);
    const [startingDebate, setStartingDebate] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'learning' | 'mastered'>('all');
    const [topicFilter, setTopicFilter] = useState<TopicValue | 'all'>('all');
    const [modeFilter, setModeFilter] = useState<'all' | 'spoken' | 'written'>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [clusters, setClusters] = useState<PhraseCluster[]>([]);
    const [pendingDebates, setPendingDebates] = useState<PendingDebate[]>([]);

    useEffect(() => {
        const loadPhrases = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            try {
                const { getUserPhrases } = await import('@/lib/db/srs');
                const savedPhrases = await getUserPhrases(user.uid);
                const displayPhrases: Phrase[] = savedPhrases.map(sp => ({
                    id: sp.id,
                    phrase: sp.phrase,
                    meaning: sp.meaning,
                    context: sp.context,
                    sourceTitle: 'Saved from reading',
                    createdAt: sp.createdAt instanceof Date
                        ? sp.createdAt
                        : (sp.createdAt && typeof sp.createdAt === 'object' && 'toDate' in sp.createdAt)
                            ? (sp.createdAt as { toDate: () => Date }).toDate()
                            : new Date(sp.createdAt as string || Date.now()),
                    showCount: sp.usageCount || 0,
                    practiceCount: sp.practiceCount || 0,
                    nextShowAt: null,
                    retired: (sp.usageCount || 0) >= 6,
                    topics: sp.topics as TopicValue[] | undefined,
                    children: (sp as { children?: ChildExpression[] }).children,
                    mode: (sp as { usage?: 'spoken' | 'written' | 'neutral' }).usage || 'neutral',
                }));
                setPhrases(displayPhrases);
            } catch (error) {
                console.error('Error loading phrases:', error);
            }
            setLoading(false);
        };
        loadPhrases();
    }, [user?.uid]);

    // Fetch pending debates on mount
    useEffect(() => {
        const loadPendingDebates = async () => {
            if (!user?.uid) return;
            try {
                const response = await fetch('/api/user/pending-debates', {
                    headers: { 'x-user-id': user.uid },
                });
                if (response.ok) {
                    const data = await response.json();
                    setPendingDebates(data.pendingDebates || []);
                }
            } catch (error) {
                console.error('Error loading pending debates:', error);
            }
        };
        loadPendingDebates();
    }, [user?.uid]);

    const handleDelete = async (id: string) => {
        setPhrases(prev => prev.filter(p => p.id !== id));
        setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
        try {
            const { deleteDoc, doc } = await import('firebase/firestore');
            const { db } = await import('@/lib/firebase');
            if (db) await deleteDoc(doc(db, 'savedPhrases', id));
        } catch (error) {
            console.error('Error deleting phrase:', error);
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setClusters([]); // Clear clusters when selection changes
    };

    const handleClusterPhrases = async () => {
        if (selectedIds.size === 0) return;
        const selectedPhrases = phrases.filter(p => selectedIds.has(p.id));

        setClustering(true);
        try {
            // Extract child expressions (collocations/phrasal verbs) for practice
            const practiceExpressions = extractPracticeExpressions(selectedPhrases);
            if (practiceExpressions.length === 0) {
                toast.error('No expressions to practice. Add some collocations or phrasal verbs.');
                setClustering(false);
                return;
            }

            const response = await fetch('/api/user/cluster-phrases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({
                    phrases: practiceExpressions,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                setClusters(data.clusters);

                // Save clusters to database as pending debates
                if (user?.uid && data.clusters.length > 0) {
                    const saveResponse = await fetch('/api/user/pending-debates', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user.uid
                        },
                        body: JSON.stringify({ clusters: data.clusters }),
                    });
                    if (saveResponse.ok) {
                        // Refresh pending debates list
                        const refreshResponse = await fetch('/api/user/pending-debates', {
                            headers: { 'x-user-id': user.uid },
                        });
                        if (refreshResponse.ok) {
                            const refreshData = await refreshResponse.json();
                            setPendingDebates(refreshData.pendingDebates || []);
                        }
                    }
                }
            } else {
                toast.error('Failed to group phrases');
            }
        } catch (error) {
            console.error('Cluster error:', error);
            toast.error('Failed to group phrases');
        } finally {
            setClustering(false);
        }
    };

    const startDebate = async (cluster: PhraseCluster) => {
        setStartingDebate(cluster.topic);
        try {
            const response = await fetch('/api/user/start-debate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({
                    userId: user?.uid,
                    phrases: cluster.phrases,
                    topicAngle: cluster.topic.toLowerCase(),
                    isScheduled: false, // On-demand = no SRS update
                }),
            });
            if (response.ok) {
                const data = await response.json();
                sessionStorage.setItem('debateData', JSON.stringify(data));
                router.push(`/practice/debate/${data.debateId}`);
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('Start debate API error:', response.status, errorData);
                toast.error(errorData.error || 'Failed to start debate');
            }
        } catch (error) {
            console.error('Start debate error:', error);
            toast.error('Failed to start debate');
        } finally {
            setStartingDebate(null);
        }
    };

    // Start a pending debate from the database
    const startPendingDebate = async (pending: PendingDebate) => {
        setStartingDebate(pending.topic);
        try {
            const response = await fetch('/api/user/start-debate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({
                    userId: user?.uid,
                    phrases: pending.phrases.map(p => ({ phraseId: pending.id, phrase: p.phrase, meaning: p.meaning })),
                    topicAngle: pending.topic.toLowerCase(),
                    isScheduled: false,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                sessionStorage.setItem('debateData', JSON.stringify(data));

                // Delete from pending debates
                await fetch(`/api/user/pending-debates?id=${pending.id}`, {
                    method: 'DELETE',
                    headers: { 'x-user-id': user?.uid || '' },
                });
                setPendingDebates(prev => prev.filter(p => p.id !== pending.id));

                router.push(`/practice/debate/${data.debateId}`);
            } else {
                const errorData = await response.json().catch(() => ({}));
                toast.error(errorData.error || 'Failed to start debate');
            }
        } catch (error) {
            console.error('Start pending debate error:', error);
            toast.error('Failed to start debate');
        } finally {
            setStartingDebate(null);
        }
    };

    // Clear all pending debates
    const clearAllPendingDebates = async () => {
        if (!user?.uid) return;
        try {
            await fetch('/api/user/pending-debates?clearAll=true', {
                method: 'DELETE',
                headers: { 'x-user-id': user.uid },
            });
            setPendingDebates([]);
            toast.info('Cleared all pending debates');
        } catch (error) {
            console.error('Clear pending debates error:', error);
            toast.error('Failed to clear pending debates');
        }
    };

    const filteredPhrases = phrases.filter(phrase => {
        const matchesSearch = phrase.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
            phrase.meaning.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' ||
            (filter === 'learning' && !phrase.retired) ||
            (filter === 'mastered' && phrase.retired);

        // Check children's topics (not root phrase topics)
        let matchesTopic = topicFilter === 'all';
        if (!matchesTopic) {
            if (phrase.children && phrase.children.length > 0) {
                // Hierarchical phrase: ONLY check children's topics, ignore root topics
                matchesTopic = phrase.children.some(child =>
                    child.topics && child.topics.includes(topicFilter as typeof child.topics[number])
                );
            } else if (phrase.topics) {
                // Flat phrase (no children): check root topics for backward compatibility
                matchesTopic = phrase.topics.includes(topicFilter as typeof phrase.topics[number]);
            }
        }

        // Check mode filter
        const matchesMode = modeFilter === 'all' || phrase.mode === modeFilter;

        return matchesSearch && matchesFilter && matchesTopic && matchesMode;
    });

    const stats = {
        total: phrases.length,
        learning: phrases.filter(p => !p.retired).length,
        mastered: phrases.filter(p => p.retired).length,
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">
                        Vocab Bank
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1 font-sans">
                        {stats.total} phrases • {stats.learning} learning • {stats.mastered} mastered
                    </p>
                </div>
            </div>

            {/* Selection bar */}
            {selectedIds.size > 0 && clusters.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="sticky top-0 z-10 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between"
                >
                    <span className="text-sm text-green-700 font-medium font-sans">
                        {selectedIds.size} phrase{selectedIds.size > 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="font-sans" onClick={() => { setSelectedIds(new Set()); setClusters([]); }}>
                            Clear
                        </Button>
                        <Button size="sm" onClick={handleClusterPhrases} disabled={clustering} className="bg-green-600 hover:bg-green-700 font-sans">
                            {clustering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
                            {clustering ? 'Grouping...' : 'Group by Topic'}
                        </Button>
                    </div>
                </motion.div>
            )}

            {/* Pending Debates from previous sessions */}
            {pendingDebates.length > 0 && clusters.length === 0 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                        <h2 className="font-medium text-neutral-700">
                            📋 {pendingDebates.length} pending debate{pendingDebates.length > 1 ? 's' : ''} waiting
                        </h2>
                        <Button variant="ghost" size="sm" onClick={clearAllPendingDebates}>
                            <X className="h-4 w-4 mr-1" /> Clear All
                        </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {pendingDebates.map((pending) => (
                            <Card key={pending.id} className="hover:shadow-md transition-shadow border-amber-200 bg-amber-50/50">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base flex items-center gap-2 font-sans">
                                            <MessageSquare className="h-4 w-4 text-amber-600" />
                                            {pending.topic}
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs border-amber-300">
                                            {pending.phrases.length} phrase{pending.phrases.length > 1 ? 's' : ''}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {pending.phrases.slice(0, 3).map((p, j) => (
                                            <Badge key={j} variant="secondary" className="text-xs font-normal">{p.phrase}</Badge>
                                        ))}
                                        {pending.phrases.length > 3 && (
                                            <Badge variant="secondary" className="text-xs font-normal">+{pending.phrases.length - 3} more</Badge>
                                        )}
                                    </div>
                                    <Button onClick={() => startPendingDebate(pending)} disabled={startingDebate !== null} size="sm" className="w-full font-sans">
                                        {startingDebate === pending.topic ? (
                                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
                                        ) : (
                                            <><Pencil className="h-4 w-4 mr-2" />Continue</>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Cluster preview */}
            {clusters.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-medium text-neutral-700">
                            {clusters.length} debate{clusters.length > 1 ? 's' : ''} grouped by topic
                        </h2>
                        <Button variant="ghost" size="sm" onClick={() => setClusters([])}>
                            <X className="h-4 w-4 mr-1" /> Back
                        </Button>
                    </div>
                    {clusters.map((cluster, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg flex items-center gap-2 font-sans">
                                        <MessageSquare className="h-5 w-5 text-green-500" />
                                        {cluster.topic}
                                    </CardTitle>
                                    <Badge variant="outline" className="text-xs">
                                        {cluster.phrases.length} phrase{cluster.phrases.length > 1 ? 's' : ''}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {cluster.phrases.map((p, j) => (
                                        <Badge key={j} variant="secondary" className="text-xs font-normal">{p.phrase}</Badge>
                                    ))}
                                </div>
                                <Button onClick={() => startDebate(cluster)} disabled={startingDebate !== null} className="w-full font-sans">
                                    {startingDebate === cluster.topic ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
                                    ) : (
                                        <><Pencil className="h-4 w-4 mr-2" />Start Debate</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </motion.div>
            )}

            {/* Search & Filters - hide when showing clusters */}
            {clusters.length === 0 && (
                <>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search phrases..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 font-sans" />
                        </div>
                        <div className="flex gap-2">
                            {(['all', 'learning', 'mastered'] as const).map((f) => (
                                <Button key={f} variant="outline" size="sm" onClick={() => setFilter(f)}
                                    className={`capitalize font-sans ${filter === f ? 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800' : ''}`}>
                                    {f}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Topic Filter */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 font-medium">Topic:</span>
                        <select
                            value={topicFilter}
                            onChange={(e) => setTopicFilter(e.target.value as TopicValue | 'all')}
                            className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 bg-white text-neutral-700 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-200 cursor-pointer"
                        >
                            <option value="all">All Topics</option>
                            {TOPIC_OPTIONS.map(topic => (
                                <option key={topic.value} value={topic.value}>
                                    {topic.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Mode Filter */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-neutral-500 font-medium">Mode:</span>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setModeFilter('all')}
                                className={`text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${modeFilter === 'all'
                                    ? 'bg-neutral-900 text-white border-neutral-900'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                                    }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setModeFilter('spoken')}
                                className={`text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${modeFilter === 'spoken'
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-purple-600 border-purple-200 hover:border-purple-300'
                                    }`}
                            >
                                Casual
                            </button>
                            <button
                                onClick={() => setModeFilter('written')}
                                className={`text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${modeFilter === 'written'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-blue-600 border-blue-200 hover:border-blue-300'
                                    }`}
                            >
                                Formal
                            </button>
                        </div>
                    </div>

                    {/* Empty State */}
                    {!loading && phrases.length === 0 && (
                        <Card className="py-12">
                            <CardContent className="text-center">
                                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <h2 className="text-xl font-semibold mb-2">No phrases yet!</h2>
                                <p className="text-muted-foreground mb-4">Start reading articles and highlight phrases to save them here.</p>
                                <Button onClick={() => window.location.href = '/feed'}>
                                    Go to Feed <ChevronRight className="ml-1 h-4 w-4" />
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Phrases List */}
                    <div className="space-y-3">
                        {loading ? (
                            <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
                        ) : (
                            <AnimatePresence>
                                {filteredPhrases.map((phrase) => (
                                    <PhraseCard key={phrase.id} phrase={phrase} onDelete={handleDelete} selected={selectedIds.has(phrase.id)} onToggleSelect={handleToggleSelect} />
                                ))}
                            </AnimatePresence>
                        )}
                        {!loading && filteredPhrases.length === 0 && phrases.length > 0 && (
                            <div className="text-center py-8 text-muted-foreground">No phrases match your search.</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
