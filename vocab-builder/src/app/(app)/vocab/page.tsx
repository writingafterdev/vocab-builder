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
    X
} from 'lucide-react';
import { toast } from 'sonner';

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
}

interface PhraseCluster {
    topic: string;
    phrases: Array<{
        phraseId: string;
        phrase: string;
        meaning: string;
    }>;
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
            <div className={`group relative bg-white border rounded-xl p-5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 ${selected ? 'border-green-300 bg-green-50/30' : 'border-neutral-100 hover:border-neutral-200'
                }`}>
                <div className="flex items-start gap-3">
                    <Checkbox
                        checked={selected}
                        onCheckedChange={() => onToggleSelect(phrase.id)}
                        className="mt-1 h-5 w-5"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2.5 mb-1.5">
                            <h3 className="font-serif font-medium text-xl text-neutral-900 leading-tight">
                                {phrase.phrase}
                            </h3>
                        </div>
                        <p className="text-neutral-600 text-sm font-sans leading-relaxed mb-2.5">
                            {phrase.meaning}
                        </p>
                        {phrase.context && (
                            <div className="mb-3">
                                <p className="text-neutral-400 font-serif italic text-sm line-clamp-2">
                                    "{phrase.context}"
                                </p>
                            </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-neutral-400 font-sans">
                            <span className="uppercase tracking-wider">Added {formatDate(phrase.createdAt)}</span>
                            <span>•</span>
                            <span className="text-emerald-600 font-medium">Practiced {phrase.practiceCount}x</span>
                            <span>•</span>
                            <span className="text-blue-600 font-medium">Reviewed {phrase.showCount}x</span>
                        </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neutral-300 hover:text-red-500 hover:bg-red-50"
                            onClick={() => onDelete(phrase.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
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
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [clusters, setClusters] = useState<PhraseCluster[]>([]);

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
                    createdAt: sp.createdAt?.toDate() || new Date(),
                    showCount: sp.usageCount || 0,
                    practiceCount: sp.practiceCount || 0,
                    nextShowAt: null,
                    retired: (sp.usageCount || 0) >= 6,
                }));
                setPhrases(displayPhrases);
            } catch (error) {
                console.error('Error loading phrases:', error);
            }
            setLoading(false);
        };
        loadPhrases();
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
            const response = await fetch('/api/user/cluster-phrases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({
                    phrases: selectedPhrases.map(p => ({ phraseId: p.id, phrase: p.phrase, meaning: p.meaning })),
                }),
            });
            if (response.ok) {
                const data = await response.json();
                setClusters(data.clusters);
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

    const filteredPhrases = phrases.filter(phrase => {
        const matchesSearch = phrase.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
            phrase.meaning.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' ||
            (filter === 'learning' && !phrase.retired) ||
            (filter === 'mastered' && phrase.retired);
        return matchesSearch && matchesFilter;
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
