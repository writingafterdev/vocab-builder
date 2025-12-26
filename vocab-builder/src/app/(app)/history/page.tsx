'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { initializeFirebase } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Loader2,
    MessageSquare,
    CheckCircle,
    XCircle,
    Calendar,
    TrendingUp,
    ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface DebateHistoryItem {
    id: string;
    topic: string;
    topicAngle: string;
    createdAt: Date;
    status: string;
    phrasesTotal: number;
    phrasesUsed: number;
    phrasesNatural: number;
    turnsCount: number;
}

export default function HistoryPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [debates, setDebates] = useState<DebateHistoryItem[]>([]);

    useEffect(() => {
        async function loadHistory() {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                // Initialize Firebase dynamically
                const { db } = await initializeFirebase();
                if (!db) {
                    console.error('Failed to initialize Firebase');
                    setLoading(false);
                    return;
                }

                // Dynamic import of Firestore functions
                const { collection, query, where, limit, getDocs } = await import('firebase/firestore');

                // Simple query - filter status on client to avoid composite index issues
                const debatesRef = collection(db, 'debates');
                const q = query(
                    debatesRef,
                    where('userId', '==', user.uid),
                    limit(100)
                );

                const snapshot = await getDocs(q);
                const items: DebateHistoryItem[] = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        const phrases = data.phrases || [];
                        return {
                            id: doc.id,
                            topic: data.topic || 'Untitled',
                            topicAngle: data.topicAngle || '',
                            createdAt: data.createdAt?.toDate?.() || new Date(),
                            status: data.status,
                            phrasesTotal: phrases.length,
                            phrasesUsed: phrases.filter((p: { used: boolean }) => p.used).length,
                            phrasesNatural: phrases.filter((p: { status: string }) => p.status === 'natural').length,
                            turnsCount: (data.turns || []).length,
                        };
                    })
                    // Filter completed on client side to avoid composite index
                    .filter(d => d.status === 'completed')
                    // Sort on client side
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

                setDebates(items);
            } catch (error) {
                console.error('Error loading history:', error);
            } finally {
                setLoading(false);
            }
        }

        loadHistory();
    }, [user]);

    // Calculate stats
    const totalDebates = debates.length;
    const totalPhrasesNatural = debates.reduce((sum, d) => sum + d.phrasesNatural, 0);
    const totalPhrasesPracticed = debates.reduce((sum, d) => sum + d.phrasesTotal, 0);

    if (!user) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500">Please sign in to view your history.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mb-4" />
                <p className="text-neutral-500 font-sans">Loading your history...</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4 font-sans">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-neutral-900 mb-2">Debate History</h1>
                <p className="text-neutral-500">Track your progress and review past conversations.</p>
            </div>

            {/* Stats */}
            {totalDebates > 0 && (
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <Card className="border-neutral-200">
                        <CardContent className="pt-4 pb-4 text-center">
                            <div className="text-2xl font-bold text-neutral-900">{totalDebates}</div>
                            <div className="text-xs text-neutral-500 uppercase tracking-wider mt-1">Debates</div>
                        </CardContent>
                    </Card>
                    <Card className="border-neutral-200">
                        <CardContent className="pt-4 pb-4 text-center">
                            <div className="text-2xl font-bold text-emerald-600">{totalPhrasesNatural}</div>
                            <div className="text-xs text-neutral-500 uppercase tracking-wider mt-1">Mastered</div>
                        </CardContent>
                    </Card>
                    <Card className="border-neutral-200">
                        <CardContent className="pt-4 pb-4 text-center">
                            <div className="text-2xl font-bold text-neutral-900">{totalPhrasesPracticed}</div>
                            <div className="text-xs text-neutral-500 uppercase tracking-wider mt-1">Practiced</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Debate List */}
            {debates.length === 0 ? (
                <Card className="border-neutral-200">
                    <CardContent className="py-12 text-center">
                        <MessageSquare className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                        <h3 className="font-medium text-neutral-900 mb-2">No debates yet</h3>
                        <p className="text-sm text-neutral-500 mb-4">
                            Complete your first debate to see it here.
                        </p>
                        <Link href="/practice">
                            <Button className="bg-neutral-900 hover:bg-neutral-800 text-white">
                                Start Practicing
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {debates.map((debate) => (
                        <Link key={debate.id} href={`/history/${debate.id}`}>
                            <Card className="border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer group">
                                <CardContent className="py-4 px-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-medium text-neutral-900 truncate">
                                                    {debate.topic}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-neutral-400">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {debate.createdAt.toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: debate.createdAt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                                                    })}
                                                </span>
                                                <span>•</span>
                                                <span>{debate.turnsCount} turns</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex items-center gap-1.5">
                                                {debate.phrasesNatural > 0 && (
                                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-0 text-xs">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        {debate.phrasesNatural}
                                                    </Badge>
                                                )}
                                                {debate.phrasesTotal - debate.phrasesUsed > 0 && (
                                                    <Badge variant="secondary" className="bg-neutral-100 text-neutral-500 border-0 text-xs">
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        {debate.phrasesTotal - debate.phrasesUsed}
                                                    </Badge>
                                                )}
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {/* Motivation footer */}
            {totalDebates > 0 && (
                <div className="mt-8 text-center">
                    <p className="text-sm text-neutral-400 flex items-center justify-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Keep practicing to master more phrases!
                    </p>
                </div>
            )}
        </div>
    );
}
