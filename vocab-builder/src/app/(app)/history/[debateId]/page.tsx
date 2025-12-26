'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { initializeFirebase } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Loader2,
    ArrowLeft,
    CheckCircle,
    AlertTriangle,
    XCircle,
    User,
    Bot,
    Calendar,
    Languages
} from 'lucide-react';
import Link from 'next/link';

interface DebatePhrase {
    phrase: string;
    meaning: string;
    used: boolean;
    status: 'natural' | 'forced' | 'missing' | 'pending';
    feedback: string;
}

interface DebateTurn {
    turnNumber: number;
    userMessage: string;
    opponentResponse: string;
}

interface AssistedPhrase {
    vietnamese: string;
    english: string;
}

interface DebateData {
    topic: string;
    topicAngle: string;
    backgroundContent: string;
    opponentPersona: string;
    opponentPosition: string;
    phrases: DebatePhrase[];
    turns: DebateTurn[];
    assistedPhrases: AssistedPhrase[];
    createdAt: Date;
    status: string;
}

export default function DebateHistoryDetailPage() {
    const params = useParams();
    const { user } = useAuth();
    const debateId = params.debateId as string;

    const [loading, setLoading] = useState(true);
    const [debate, setDebate] = useState<DebateData | null>(null);

    useEffect(() => {
        async function loadDebate() {
            if (!debateId) {
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
                const { doc, getDoc } = await import('firebase/firestore');

                const debateRef = doc(db, 'debates', debateId);
                const snapshot = await getDoc(debateRef);

                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setDebate({
                        topic: data.topic || 'Untitled',
                        topicAngle: data.topicAngle || '',
                        backgroundContent: data.backgroundContent || '',
                        opponentPersona: data.opponentPersona || 'AI',
                        opponentPosition: data.opponentPosition || '',
                        phrases: data.phrases || [],
                        turns: data.turns || [],
                        assistedPhrases: data.assistedPhrases || [],
                        createdAt: data.createdAt?.toDate() || new Date(),
                        status: data.status || 'completed',
                    });
                }
            } catch (error) {
                console.error('Error loading debate:', error);
            } finally {
                setLoading(false);
            }
        }

        loadDebate();
    }, [debateId]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'natural':
                return <CheckCircle className="h-4 w-4 text-emerald-500" />;
            case 'forced':
                return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'missing':
                return <XCircle className="h-4 w-4 text-red-400" />;
            default:
                return null;
        }
    };

    if (!user) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500">Please sign in to view this debate.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mb-4" />
                <p className="text-neutral-500 font-sans">Loading debate...</p>
            </div>
        );
    }

    if (!debate) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center">
                <p className="text-neutral-500">Debate not found.</p>
                <Link href="/history">
                    <Button variant="outline" className="mt-4">Back to History</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-6 px-4 font-sans">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/history">
                    <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-neutral-900">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                </Link>
            </div>

            {/* Title & Meta */}
            <div className="mb-6">
                <h1 className="text-xl font-bold text-neutral-900 mb-2">{debate.topic}</h1>
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Calendar className="h-4 w-4" />
                    {debate.createdAt.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}
                </div>
            </div>

            {/* Phrase Results */}
            <Card className="mb-6 border-neutral-200">
                <CardContent className="pt-4">
                    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
                        Phrases Practiced
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {debate.phrases.map((p, i) => (
                            <Badge
                                key={i}
                                variant="secondary"
                                className={`
                                    px-3 py-1.5 text-sm font-medium
                                    ${p.status === 'natural'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : p.status === 'forced'
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                                    }
                                `}
                            >
                                {getStatusIcon(p.status)}
                                <span className="ml-1.5">{p.phrase}</span>
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Translated Phrases */}
            {debate.assistedPhrases.length > 0 && (
                <Card className="mb-6 border-blue-200 bg-blue-50/30">
                    <CardContent className="pt-4">
                        <h3 className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Languages className="h-4 w-4" />
                            Phrases Translated During Debate
                        </h3>
                        <div className="space-y-2">
                            {debate.assistedPhrases.map((p, i) => (
                                <div key={i} className="flex items-center justify-between p-2 bg-white/70 rounded-lg border border-blue-100">
                                    <span className="text-sm font-medium text-neutral-900">{p.english}</span>
                                    <span className="text-xs text-neutral-500">{p.vietnamese}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Conversation Replay */}
            <div className="mb-6">
                <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">
                    Conversation
                </h3>

                <div className="space-y-6">
                    {/* Opponent's opening */}
                    {debate.opponentPosition && (
                        <div className="flex gap-4 max-w-[90%]">
                            <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-neutral-200 shadow-sm">
                                <Bot className="h-5 w-5 text-neutral-900" />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-neutral-400 ml-1 block">{debate.opponentPersona}</span>
                                <div className="bg-white border border-neutral-200 rounded-2xl rounded-tl-none p-4 shadow-sm text-neutral-900 leading-relaxed">
                                    {debate.opponentPosition}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Turns */}
                    {debate.turns.map((turn, i) => (
                        <div key={i} className="space-y-6">
                            {/* User message */}
                            <div className="flex gap-4 justify-end max-w-[90%] ml-auto">
                                <div className="space-y-1">
                                    <div className="bg-neutral-900 text-white rounded-2xl rounded-tr-none p-4 shadow-sm leading-relaxed">
                                        {turn.userMessage}
                                    </div>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 border border-neutral-900">
                                    <User className="h-5 w-5 text-white" />
                                </div>
                            </div>

                            {/* Opponent response */}
                            {turn.opponentResponse && (
                                <div className="flex gap-4 max-w-[90%]">
                                    <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-neutral-200 shadow-sm">
                                        <Bot className="h-5 w-5 text-neutral-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="bg-white border border-neutral-200 rounded-2xl rounded-tl-none p-4 shadow-sm text-neutral-900 leading-relaxed">
                                            {turn.opponentResponse}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-100">
                <Link href="/history" className="flex-1">
                    <Button variant="outline" className="w-full h-11 font-sans">Back to History</Button>
                </Link>
                <Link href="/practice" className="flex-1">
                    <Button className="w-full h-11 bg-neutral-900 hover:bg-neutral-800 text-white font-sans">Practice More</Button>
                </Link>
            </div>
        </div>
    );
}
