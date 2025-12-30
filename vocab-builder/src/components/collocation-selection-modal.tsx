'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TOPIC_OPTIONS, TopicValue } from '@/lib/db/types';
import { Loader2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

interface ExpressionSuggestion {
    phrase: string;
    meaning: string;
    example?: string;  // AI-generated example sentence
    mode: 'spoken' | 'written' | 'neutral';
    topics?: TopicValue[];
}

interface ApiResponse {
    meaning: string;
    example?: string;  // Root word example sentence
    mode: 'spoken' | 'written' | 'neutral';
    topics?: TopicValue[];
    collocations: ExpressionSuggestion[];
    phrasalVerbs: ExpressionSuggestion[];
    rootWord: string;
}

interface CollocationSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        rootWord: string;
        meaning: string;
        mode: 'spoken' | 'written' | 'neutral';
        topics: string[];
        children: Array<{
            type: 'collocation' | 'phrasal_verb';
            phrase: string;
            meaning: string;
            example: string;
            mode: 'spoken' | 'written' | 'neutral';
            topics: string[];
        }>;
    }) => void;
    highlightedWord: string;
    context: string;
    userId?: string;
    userEmail?: string;
}

export default function CollocationSelectionModal({
    isOpen,
    onClose,
    onSave,
    highlightedWord,
    context,
    userId,
    userEmail,
}: CollocationSelectionModalProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [selectedCollocations, setSelectedCollocations] = useState<Set<number>>(new Set());
    const [selectedPhrasalVerbs, setSelectedPhrasalVerbs] = useState<Set<number>>(new Set());
    const [savesRemaining, setSavesRemaining] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && highlightedWord && context) {
            fetchData();
            fetchSavesRemaining();
        }
    }, [isOpen, highlightedWord, context]);

    const fetchSavesRemaining = async () => {
        if (!userId) return;
        try {
            const response = await fetch('/api/user/phrase-limit', {
                headers: { 'x-user-id': userId },
            });
            if (response.ok) {
                const result = await response.json();
                setSavesRemaining(result.remaining);
            } else {
                setSavesRemaining(null);
            }
        } catch {
            setSavesRemaining(null);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setData(null);
        setSelectedCollocations(new Set());
        setSelectedPhrasalVerbs(new Set());

        try {
            const response = await fetch('/api/user/suggest-collocations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || '',
                    'x-user-email': userEmail || '',
                },
                body: JSON.stringify({
                    word: highlightedWord,
                    context: context,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch');
            }

            const result: ApiResponse = await response.json();
            setData(result);
        } catch (error) {
            console.error('Error fetching:', error);
            // Fallback: just the word with generic meaning
            setData({
                meaning: 'A common English expression',
                mode: 'neutral',
                topics: [],
                collocations: [],
                phrasalVerbs: [],
                rootWord: highlightedWord,
            });
        }
        setLoading(false);
    };

    const toggleCollocation = (index: number) => {
        const newSelected = new Set(selectedCollocations);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedCollocations(newSelected);
    };

    const togglePhrasalVerb = (index: number) => {
        const newSelected = new Set(selectedPhrasalVerbs);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedPhrasalVerbs(newSelected);
    };

    const handleSave = () => {
        if (!data) return;

        // Build children array from selected collocations and phrasal verbs
        const children: Array<{
            type: 'collocation' | 'phrasal_verb';
            phrase: string;
            meaning: string;
            example: string;
            mode: 'spoken' | 'written' | 'neutral';
            topics: string[];
        }> = [];

        // Add selected collocations
        selectedCollocations.forEach(index => {
            const c = data.collocations[index];
            if (c) {
                children.push({
                    type: 'collocation',
                    phrase: c.phrase,
                    meaning: c.meaning,
                    example: c.example || '',
                    mode: c.mode,
                    topics: c.topics || [],
                });
            }
        });

        // Add selected phrasal verbs
        selectedPhrasalVerbs.forEach(index => {
            const p = data.phrasalVerbs[index];
            if (p) {
                children.push({
                    type: 'phrasal_verb',
                    phrase: p.phrase,
                    meaning: p.meaning,
                    example: p.example || '',
                    mode: p.mode,
                    topics: p.topics || [],
                });
            }
        });

        // Save hierarchical structure
        onSave({
            rootWord: data.rootWord,
            meaning: data.meaning,
            mode: data.mode,
            topics: data.topics || [],
            children,
        });
        onClose();
    };

    const getModeColor = (mode: string) => {
        switch (mode) {
            case 'spoken': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
            case 'written': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
            default: return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
        }
    };

    const getModeLabel = (mode: string) => {
        switch (mode) {
            case 'spoken': return '🗣️ Spoken';
            case 'written': return '✍️ Written';
            default: return '↔️ Neutral';
        }
    };

    const hasCollocations = data && data.collocations.length > 0;
    const hasPhrasalVerbs = data && data.phrasalVerbs.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg font-sans">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5" />
                            Save to Vocab Bank
                        </div>
                        {savesRemaining !== null && (
                            <span className={`text-xs font-normal px-2 py-1 rounded-full ${savesRemaining === 0
                                ? 'bg-red-100 text-red-700'
                                : savesRemaining <= 3
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                {savesRemaining === 0 ? 'Limit reached' : `${savesRemaining} saves left today`}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-muted-foreground">Analyzing...</span>
                    </div>
                ) : data ? (
                    <div className="space-y-4">
                        {/* Root Word - Always Selected */}
                        <div className="p-3 rounded-lg border-2 border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    checked={true}
                                    disabled={true}
                                    className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="font-semibold text-lg">{data.rootWord || highlightedWord}</span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                            ✓ Always saved
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${getModeColor(data.mode)}`}>
                                            {getModeLabel(data.mode)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        {data.meaning}
                                    </p>
                                    {data.example && (
                                        <p className="text-xs text-neutral-500 italic">
                                            "{data.example}"
                                        </p>
                                    )}
                                    {/* Root word topics */}
                                    {data.topics && data.topics.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                            {data.topics.map(topic => (
                                                <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                                    {TOPIC_OPTIONS.find(t => t.value === topic)?.label || topic}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Context reminder */}
                        <p className="text-xs text-muted-foreground italic px-1">
                            From: "{context.length > 60 ? context.slice(0, 60) + '...' : context}"
                        </p>

                        {/* Collocations Section */}
                        {hasCollocations ? (
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    📚 Common collocations (select to save):
                                </p>
                                <div className="space-y-2">
                                    {data.collocations.map((collocation, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedCollocations.has(index)
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'
                                                }`}
                                            onClick={() => toggleCollocation(index)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedCollocations.has(index)}
                                                    onCheckedChange={() => toggleCollocation(index)}
                                                    className="mt-0.5"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium">{collocation.phrase}</span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${getModeColor(collocation.mode)}`}>
                                                            {getModeLabel(collocation.mode)}
                                                        </span>
                                                        {collocation.topics && collocation.topics.length > 0 && (
                                                            <>
                                                                {collocation.topics.map(topic => (
                                                                    <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                                                                        {TOPIC_OPTIONS.find(t => t.value === topic)?.label || topic}
                                                                    </span>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {collocation.meaning}
                                                    </p>
                                                    {collocation.example && (
                                                        <p className="text-xs italic text-muted-foreground/80 mt-1">
                                                            "{collocation.example}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Phrasal Verbs Section */}
                        {hasPhrasalVerbs ? (
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    🔗 Phrasal verbs (select to save):
                                </p>
                                <div className="space-y-2">
                                    {data.phrasalVerbs.map((pv, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedPhrasalVerbs.has(index)
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'
                                                }`}
                                            onClick={() => togglePhrasalVerb(index)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedPhrasalVerbs.has(index)}
                                                    onCheckedChange={() => togglePhrasalVerb(index)}
                                                    className="mt-0.5"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium">{pv.phrase}</span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${getModeColor(pv.mode)}`}>
                                                            {getModeLabel(pv.mode)}
                                                        </span>
                                                        {pv.topics && pv.topics.length > 0 && (
                                                            <>
                                                                {pv.topics.map(topic => (
                                                                    <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                                                                        {TOPIC_OPTIONS.find(t => t.value === topic)?.label || topic}
                                                                    </span>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {pv.meaning}
                                                    </p>
                                                    {pv.example && (
                                                        <p className="text-xs italic text-muted-foreground/80 mt-1">
                                                            "{pv.example}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Empty State */}
                        {!hasCollocations && !hasPhrasalVerbs && (
                            <p className="text-sm text-muted-foreground text-center py-2">
                                No common expressions found. The word will be saved as-is.
                            </p>
                        )}
                    </div>
                ) : null}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading || savesRemaining === 0}>
                        {savesRemaining === 0
                            ? 'Daily limit reached'
                            : (selectedCollocations.size + selectedPhrasalVerbs.size) > 0
                                ? `Save ${selectedCollocations.size + selectedPhrasalVerbs.size} expression(s)`
                                : `Save "${highlightedWord}"`
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
