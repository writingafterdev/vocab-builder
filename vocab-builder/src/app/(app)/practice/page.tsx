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

export default function PracticePage() {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [clustering, setClustering] = useState(false);
    const [startingDebate, setStartingDebate] = useState<string | null>(null);
    const [clusters, setClusters] = useState<PhraseCluster[]>([]);
    const [totalPhrases, setTotalPhrases] = useState(0);

    useEffect(() => {
        async function loadAndClusterPhrases() {
            if (!user) return;

            setLoading(true);
            try {
                const { passive, active } = await getDuePhrasesbyType(user.uid);
                const allDuePhrases = [...passive, ...active];
                setTotalPhrases(allDuePhrases.length);

                if (allDuePhrases.length === 0) {
                    setClusters([]);
                    setLoading(false);
                    return;
                }

                // Cluster phrases by topic
                setClustering(true);
                const response = await fetch('/api/user/cluster-phrases', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-email': user?.email || '',
                    },
                    body: JSON.stringify({
                        phrases: allDuePhrases.map(p => ({
                            phraseId: p.id,
                            phrase: p.phrase,
                            meaning: p.meaning,
                        })),
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    setClusters(data.clusters);
                } else {
                    // Fallback: single cluster with all phrases
                    setClusters([{
                        topic: 'Today\'s Review',
                        phrases: allDuePhrases.slice(0, 4).map(p => ({
                            phraseId: p.id,
                            phrase: p.phrase,
                            meaning: p.meaning,
                        })),
                    }]);
                }
            } catch (error) {
                console.error('Error loading phrases:', error);
            } finally {
                setLoading(false);
                setClustering(false);
            }
        }

        loadAndClusterPhrases();
    }, [user]);

    const startDebate = async (cluster: PhraseCluster) => {
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
                    {totalPhrases > 0
                        ? `${totalPhrases} phrase${totalPhrases > 1 ? 's' : ''} to review • ${clusters.length} debate${clusters.length > 1 ? 's' : ''}`
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
            ) : clusters.length > 0 ? (
                <div className="space-y-4">
                    {clusters.map((cluster, index) => (
                        <Card key={index} className="hover:shadow-md transition-shadow">
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
                                {/* Phrase preview */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {cluster.phrases.map((p, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                                            {p.phrase}
                                        </Badge>
                                    ))}
                                </div>

                                <Button
                                    onClick={() => startDebate(cluster)}
                                    disabled={startingDebate !== null}
                                    className="w-full font-sans"
                                >
                                    {startingDebate === cluster.topic ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Starting...
                                        </>
                                    ) : (
                                        <>
                                            <Pencil className="h-4 w-4 mr-2" />
                                            Start Debate
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
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
