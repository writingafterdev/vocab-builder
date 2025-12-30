'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { getDuePhrasesbyType } from '@/lib/db/srs';
import type { SavedPhrase } from '@/lib/db/types';
import { toast } from 'sonner';

interface PhraseCluster {
    topic: string;
    phrases: Array<{
        phraseId: string;
        phrase: string;
        meaning: string;
    }>;
}

// Helper: Extract expressions to practice from SavedPhrases
// Uses children (collocations/phrasal verbs) if available, otherwise root phrase
function extractPracticeExpressions(phrases: SavedPhrase[]): Array<{
    phraseId: string;
    phrase: string;
    meaning: string;
}> {
    const expressions: Array<{ phraseId: string; phrase: string; meaning: string }> = [];

    for (const p of phrases) {
        if (p.children && p.children.length > 0) {
            // Use children (collocations & phrasal verbs) for practice
            for (const child of p.children) {
                expressions.push({
                    phraseId: p.id, // Link back to parent for SRS updates
                    phrase: child.phrase,
                    meaning: child.meaning,
                });
            }
        } else {
            // Fallback: use root phrase if no children (backward compatibility)
            expressions.push({
                phraseId: p.id,
                phrase: p.phrase,
                meaning: p.meaning,
            });
        }
    }

    return expressions;
}

export default function PracticePage() {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [clustering, setClustering] = useState(false);
    const [startingDebate, setStartingDebate] = useState<string | null>(null);
    const [spokenClusters, setSpokenClusters] = useState<PhraseCluster[]>([]);
    const [writtenClusters, setWrittenClusters] = useState<PhraseCluster[]>([]);
    const [totalSpoken, setTotalSpoken] = useState(0);
    const [totalWritten, setTotalWritten] = useState(0);

    useEffect(() => {
        async function loadAndClusterPhrases() {
            if (!user) return;

            setLoading(true);
            try {
                const { passive, active } = await getDuePhrasesbyType(user.uid);
                const allDuePhrases = [...passive, ...active];

                // Separate by usage mode
                const spokenPhrases = allDuePhrases.filter(p => p.usage === 'spoken');
                const writtenPhrases = allDuePhrases.filter(p => p.usage === 'written');
                const neutralPhrases = allDuePhrases.filter(p => !p.usage || p.usage === 'neutral');

                // Put neutral phrases in Written section (formal style works in all contexts)
                const spokenWithNeutral = [...spokenPhrases];
                const writtenWithNeutral = [...writtenPhrases, ...neutralPhrases];

                setTotalSpoken(spokenWithNeutral.length);
                setTotalWritten(writtenWithNeutral.length);

                if (allDuePhrases.length === 0) {
                    setSpokenClusters([]);
                    setWrittenClusters([]);
                    setLoading(false);
                    return;
                }

                // Create a hash of phrase IDs to check if we need to re-cluster
                const spokenIds = spokenWithNeutral.map(p => p.id).sort().join(',');
                const writtenIds = writtenWithNeutral.map(p => p.id).sort().join(',');
                const cacheKey = `clusters_${user.uid}`;

                // Check localStorage for cached clusters
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const { spokenHash, writtenHash, spoken, written, timestamp } = JSON.parse(cached);

                        // Cache expires at midnight (end of today)
                        const cacheDate = new Date(timestamp || 0);
                        const today = new Date();
                        const isSameDay = cacheDate.toDateString() === today.toDateString();

                        // Use cache if phrases haven't changed and cache is from today
                        if (spokenHash === spokenIds && writtenHash === writtenIds && isSameDay) {
                            setSpokenClusters(spoken || []);
                            setWrittenClusters(written || []);
                            setLoading(false);
                            return;
                        }
                    } catch {
                        // Cache corrupted, continue to re-cluster
                    }
                }

                // Cluster each mode separately
                setClustering(true);

                const clusterPhrases = async (phrases: SavedPhrase[]): Promise<PhraseCluster[]> => {
                    if (phrases.length === 0) return [];

                    // Extract child expressions (collocations/phrasal verbs) for practice
                    const practiceExpressions = extractPracticeExpressions(phrases);
                    if (practiceExpressions.length === 0) return [];

                    const response = await fetch('/api/user/cluster-phrases', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-email': user?.email || '',
                        },
                        body: JSON.stringify({
                            phrases: practiceExpressions,
                        }),
                    });
                    if (response.ok) {
                        const data = await response.json();
                        return data.clusters;
                    }
                    // Fallback: return first 4 expressions as single cluster
                    return [{
                        topic: 'Review',
                        phrases: practiceExpressions.slice(0, 4),
                    }];
                };

                const [spoken, written] = await Promise.all([
                    clusterPhrases(spokenWithNeutral),
                    clusterPhrases(writtenWithNeutral),
                ]);

                // Cache the results
                localStorage.setItem(cacheKey, JSON.stringify({
                    spokenHash: spokenIds,
                    writtenHash: writtenIds,
                    spoken,
                    written,
                    timestamp: Date.now(),
                }));

                setSpokenClusters(spoken);
                setWrittenClusters(written);
            } catch (error) {
                console.error('Error loading phrases:', error);
            } finally {
                setLoading(false);
                setClustering(false);
            }
        }

        loadAndClusterPhrases();
    }, [user]);

    const startDebate = async (cluster: PhraseCluster, mode: 'spoken' | 'written' = 'spoken') => {
        setStartingDebate(cluster.topic);
        try {
            const response = await fetch('/api/user/start-debate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    userId: user?.uid,
                    phrases: cluster.phrases,
                    topicAngle: cluster.topic.toLowerCase(),
                    isScheduled: true,
                    mode: mode,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                sessionStorage.setItem('debateData', JSON.stringify(data));
                router.push(`/practice/debate/${data.debateId}`);
            } else {
                toast.error('Failed to start debate');
            }
        } catch (error) {
            console.error('Start debate error:', error);
            toast.error('Failed to start debate');
        } finally {
            setStartingDebate(null);
        }
    };

    if (!user) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500">Please sign in to access practice.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-6 px-4">
            <Link href="/feed" className="inline-block mb-6">
                <Button variant="ghost" size="sm" className="text-neutral-500 font-sans">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Feed
                </Button>
            </Link>

            <div className="mb-8">
                <h1 className="text-2xl font-bold text-neutral-900 mb-2 font-sans">Daily Practice</h1>
                <p className="text-neutral-500 font-sans">
                    {(totalSpoken + totalWritten) > 0
                        ? `${totalSpoken + totalWritten} phrases to review`
                        : 'No reviews due today. Great job! 🎉'
                    }
                </p>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-neutral-400 mb-3" />
                    <p className="text-sm text-neutral-400">
                        {clustering ? 'Grouping phrases by topic...' : 'Loading phrases...'}
                    </p>
                </div>
            ) : (spokenClusters.length > 0 || writtenClusters.length > 0) ? (
                <div className="space-y-8">
                    {/* Spoken Section */}
                    {spokenClusters.length > 0 && (
                        <div>
                            <div className="flex items-end gap-3 mb-5 pl-1">
                                <h2 className="text-xl font-bold tracking-tight text-neutral-800 font-sans">
                                    Spoken
                                </h2>
                                <span className="text-sm text-neutral-500 font-medium pb-0.5 font-sans">Casual, Twitter/Reddit style</span>
                                <Badge variant="secondary" className="ml-auto font-sans bg-neutral-100 text-neutral-600">
                                    {totalSpoken} phrases
                                </Badge>
                            </div>
                            <div className="space-y-4">
                                {spokenClusters.map((cluster: PhraseCluster, index: number) => (
                                    <div key={`spoken-${index}`} className="group relative bg-white border border-neutral-200 rounded-xl overflow-hidden hover:border-neutral-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300">
                                        <div className="p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100">
                                                        <span className="text-lg">🗣️</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-neutral-900 font-sans text-lg">{cluster.topic}</h3>
                                                        <p className="text-xs text-neutral-500 font-sans mt-0.5">Recommended Debate Topic</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="font-sans border-neutral-200 text-neutral-500 font-medium">
                                                    {cluster.phrases.length} phrase{cluster.phrases.length > 1 ? 's' : ''}
                                                </Badge>
                                            </div>

                                            <div className="bg-neutral-50/50 rounded-lg p-4 mb-5 border border-neutral-100/50">
                                                <div className="flex flex-wrap gap-2">
                                                    {cluster.phrases.map((p: { phrase: string; phraseId: string; meaning: string }, i: number) => (
                                                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-neutral-200 text-sm text-neutral-600 font-sans shadow-sm">
                                                            {p.phrase}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <Button
                                                onClick={() => startDebate(cluster, 'spoken')}
                                                disabled={startingDebate !== null}
                                                variant="outline"
                                                className="w-full h-11 font-medium font-sans border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
                                            >
                                                {startingDebate === cluster.topic ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Starting Session...
                                                    </>
                                                ) : (
                                                    <>
                                                        <MessageSquare className="h-4 w-4 mr-2 text-neutral-400" />
                                                        Start Casual Debate
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Written Section */}
                    {writtenClusters.length > 0 && (
                        <div>
                            <div className="flex items-end gap-3 mb-5 pl-1 pt-4">
                                <h2 className="text-xl font-bold tracking-tight text-neutral-900 font-sans">
                                    Written
                                </h2>
                                <span className="text-sm text-neutral-500 font-medium pb-0.5 font-sans">Formal, academic style</span>
                                <Badge variant="secondary" className="ml-auto font-sans bg-neutral-100 text-neutral-600">
                                    {totalWritten} phrases
                                </Badge>
                            </div>
                            <div className="space-y-4">
                                {writtenClusters.map((cluster: PhraseCluster, index: number) => (
                                    <div key={`written-${index}`} className="group relative bg-white border border-neutral-200 rounded-xl overflow-hidden hover:border-neutral-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300">
                                        <div className="p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-900 shadow-sm">
                                                        <span className="text-lg text-white">✍️</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-neutral-900 font-sans text-lg">{cluster.topic}</h3>
                                                        <p className="text-xs text-neutral-500 font-sans mt-0.5">Recommended Debate Topic</p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="font-sans border-neutral-200 text-neutral-500 font-medium">
                                                    {cluster.phrases.length} phrase{cluster.phrases.length > 1 ? 's' : ''}
                                                </Badge>
                                            </div>

                                            <div className="bg-neutral-50/50 rounded-lg p-4 mb-5 border border-neutral-100/50">
                                                <div className="flex flex-wrap gap-2">
                                                    {cluster.phrases.map((p: { phrase: string; phraseId: string; meaning: string }, i: number) => (
                                                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-neutral-200 text-sm text-neutral-600 font-sans shadow-sm">
                                                            {p.phrase}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <Button
                                                onClick={() => startDebate(cluster, 'written')}
                                                disabled={startingDebate !== null}
                                                variant="outline"
                                                className="w-full h-11 font-medium font-sans border-neutral-900 text-neutral-900 hover:bg-neutral-50 transition-colors"
                                            >
                                                {startingDebate === cluster.topic ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Starting Session...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Start Formal Debate
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-8">
                    <p className="text-4xl mb-2">🎯</p>
                    <p className="text-neutral-600 font-sans">
                        All caught up! Save more phrases to keep learning.
                    </p>
                    <Link href="/feed">
                        <Button variant="link" className="mt-2 font-sans">
                            Browse articles →
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
