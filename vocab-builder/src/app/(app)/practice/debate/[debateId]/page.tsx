'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Loader2,
    ArrowLeft,
    CheckCircle,
    AlertTriangle,
    XCircle,
    ChevronDown,
    ChevronUp,
    Send,
    User,
    Bot,
    BookOpen,
    MessageSquare,
    Languages,
    Sparkles,
    Plus
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface DebatePhrase {
    phrase: string;
    phraseId: string;
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

interface TranslationSuggestion {
    suggestion: string;
    translations: Array<{ vietnamese: string; english: string }>;
}

interface AssistedPhrase {
    vietnamese: string;
    english: string;
}

export default function DebatePage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const debateId = params.debateId as string;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showBackground, setShowBackground] = useState(true);

    // Debate data
    const [topic, setTopic] = useState('');
    const [background, setBackground] = useState('');
    const [phrases, setPhrases] = useState<DebatePhrase[]>([]);
    const [opponentPersona, setOpponentPersona] = useState('');
    const [opponentPosition, setOpponentPosition] = useState('');
    const [turns, setTurns] = useState<DebateTurn[]>([]);
    const [debateEnded, setDebateEnded] = useState(false);

    // User input
    const [userMessage, setUserMessage] = useState('');

    // Summary (after debate ends)
    const [summary, setSummary] = useState<{
        natural: number;
        forced: number;
        missing: number;
        totalTurns: number;
    } | null>(null);
    const [rhetoricalFeedback, setRhetoricalFeedback] = useState('');

    // Translation assistance
    const [translationSuggestion, setTranslationSuggestion] = useState<TranslationSuggestion | null>(null);
    const [translating, setTranslating] = useState(false);
    const [assistedPhrases, setAssistedPhrases] = useState<AssistedPhrase[]>([]);
    const translationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastTranslatedVietnameseRef = useRef<string>('');

    useEffect(() => {
        async function loadDebate() {
            if (!debateId) return;

            // Load debate data from session storage (set by practice page)
            const storedData = sessionStorage.getItem('debateData');
            if (storedData) {
                try {
                    const data = JSON.parse(storedData);
                    setTopic(data.topic || '');
                    setBackground(data.background || '');
                    setPhrases(data.phrases || []);
                    setOpponentPersona(data.opponentPersona || '');
                    setOpponentPosition(data.opponentPosition || '');
                    // Clear session storage after loading
                    sessionStorage.removeItem('debateData');
                } catch (e) {
                    console.error('Error parsing debate data:', e);
                }
            }
            setLoading(false);
        }

        loadDebate();
    }, [debateId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [turns]);

    const remainingPhrases = phrases.filter(p => !p.used);

    // Detect Vietnamese and fetch translation
    const detectVietnamese = (text: string) => {
        const vietnameseRegex = /[\u00C0-\u1EF9]/;
        return vietnameseRegex.test(text);
    };

    const fetchTranslation = async (text: string) => {
        if (!detectVietnamese(text)) {
            setTranslationSuggestion(null);
            return;
        }

        setTranslating(true);
        try {
            const response = await fetch('/api/user/translate-inline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({ text, context: topic }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.hasVietnamese && data.suggestion) {
                    setTranslationSuggestion({
                        suggestion: data.suggestion,
                        translations: data.translations || [],
                    });
                } else {
                    setTranslationSuggestion(null);
                }
            }
        } catch (error) {
            console.error('Translation error:', error);
        } finally {
            setTranslating(false);
        }
    };

    // Debounced translation detection
    const handleMessageChange = (text: string) => {
        setUserMessage(text);

        // Clear previous timeout
        if (translationTimeoutRef.current) {
            clearTimeout(translationTimeoutRef.current);
        }

        // Extract Vietnamese parts from text
        const vietnameseRegex = /[\u00C0-\u1EF9]+(?:\s+[\u00C0-\u1EF9]+)*/g;
        const vietnameseParts = text.match(vietnameseRegex)?.join(' ') || '';

        // Only fetch translation if:
        // 1. There's Vietnamese text
        // 2. AND it's different from what we already translated
        if (detectVietnamese(text) && vietnameseParts !== lastTranslatedVietnameseRef.current) {
            translationTimeoutRef.current = setTimeout(() => {
                lastTranslatedVietnameseRef.current = vietnameseParts;
                fetchTranslation(text);
            }, 1000); // 1 second debounce
        } else if (!detectVietnamese(text)) {
            setTranslationSuggestion(null);
            lastTranslatedVietnameseRef.current = '';
        }
    };

    // Accept translation suggestion
    const acceptTranslation = () => {
        if (!translationSuggestion) return;

        // Track assisted phrases
        const newAssistedPhrases = translationSuggestion.translations.filter(
            t => !assistedPhrases.some(ap => ap.vietnamese === t.vietnamese)
        );
        if (newAssistedPhrases.length > 0) {
            setAssistedPhrases(prev => [...prev, ...newAssistedPhrases]);
        }

        // Replace message with suggestion
        setUserMessage(translationSuggestion.suggestion);
        setTranslationSuggestion(null);
        toast.success('Translation applied!');
    };

    const handleSubmit = async () => {
        if (!userMessage.trim() || submitting) return;

        setSubmitting(true);

        try {
            const response = await fetch('/api/user/debate-turn', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    debateId,
                    userMessage: userMessage.trim(),
                }),
            });

            if (response.ok) {
                const data = await response.json();

                // Add new turn
                setTurns(prev => [...prev, {
                    turnNumber: data.turnNumber,
                    userMessage: userMessage.trim(),
                    opponentResponse: data.opponentResponse,
                }]);

                // Update phrases
                if (data.phraseEvaluations) {
                    setPhrases(prev => prev.map(p => {
                        const evaluation = data.phraseEvaluations.find(
                            (e: { phrase: string }) => e.phrase.toLowerCase() === p.phrase.toLowerCase()
                        );
                        if (evaluation && evaluation.status !== 'missing' && !p.used) {
                            return {
                                ...p,
                                used: true,
                                status: evaluation.status,
                                feedback: evaluation.feedback,
                            };
                        }
                        return p;
                    }));
                }

                // Clear input
                setUserMessage('');

                // Check if debate ended
                if (data.debateEnded) {
                    setDebateEnded(true);
                    // Fetch final summary
                    await fetchSummary();
                }
            } else {
                toast.error('Failed to submit response');
            }
        } catch (error) {
            console.error('Submit error:', error);
            toast.error('Failed to submit response');
        } finally {
            setSubmitting(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const response = await fetch('/api/user/end-debate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    debateId,
                    assistedPhrases, // Pass translated phrases to save
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setSummary(data.summary);
                setRhetoricalFeedback(data.rhetoricalFeedback);
                setPhrases(data.phraseResults.map((p: DebatePhrase) => ({
                    ...p,
                    used: p.status !== 'missing',
                })));
            }
        } catch (error) {
            console.error('Summary error:', error);
        }
    };

    const endDebate = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            setDebateEnded(true);
            await fetchSummary();
            toast.success('Debate ended!');
        } catch (error) {
            console.error('End debate error:', error);
            toast.error('Failed to end debate');
        } finally {
            setSubmitting(false);
        }
    };

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
                <p className="text-neutral-500">Please sign in to practice.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-4" />
                <p className="text-neutral-500 font-sans">Preparing your debate session...</p>
            </div>
        );
    }

    // Summary view
    if (debateEnded && summary) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 font-sans">
                <div className="text-center mb-8">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
                        <CheckCircle className="h-8 w-8 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-neutral-900 mb-2">Debate Complete!</h2>
                    <p className="text-neutral-500">{summary.totalTurns} turns completed • {topic}</p>
                </div>

                <div className="space-y-6">
                    {/* Phrase results */}
                    <Card className="border-neutral-200 shadow-sm">
                        <CardContent className="pt-6">
                            <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-emerald-500" />
                                Phrase Mastery
                            </h3>
                            <div className="space-y-3">
                                {phrases.map((p, i) => (
                                    <div key={i} className={`rounded-xl border p-4 transition-colors ${p.status === 'natural' ? 'border-emerald-100 bg-emerald-50/50' :
                                        p.status === 'forced' ? 'border-amber-100 bg-amber-50/50' :
                                            'border-red-100 bg-red-50/50'
                                        }`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(p.status)}
                                                <span className="font-medium text-neutral-900">{p.phrase}</span>
                                            </div>
                                            <Badge variant="outline" className={`text-xs capitalize ${p.status === 'natural' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' :
                                                p.status === 'forced' ? 'text-amber-700 border-amber-200 bg-amber-50' :
                                                    'text-red-700 border-red-200 bg-red-50'
                                                }`}>
                                                {p.status === 'natural' ? 'Mastered' :
                                                    p.status === 'forced' ? 'Needs Work' : 'Not Used'}
                                            </Badge>
                                        </div>
                                        {p.feedback && (
                                            <p className="text-sm text-neutral-600 mt-2 pl-6 leading-relaxed">
                                                {p.feedback}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Rhetorical feedback */}
                    {rhetoricalFeedback && (
                        <Card className="border-neutral-200 shadow-sm bg-indigo-50/30">
                            <CardContent className="pt-6">
                                <h3 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                                    Coach's Feedback
                                </h3>
                                <p className="text-sm text-neutral-700 leading-relaxed font-sans">{rhetoricalFeedback}</p>
                            </CardContent>
                        </Card>
                    )}
                    {/* New Phrases Discovered */}
                    {assistedPhrases.length > 0 && (
                        <Card className="border-blue-200 shadow-sm bg-blue-50/30">
                            <CardContent className="pt-6">
                                <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                                    <Languages className="h-4 w-4 text-blue-500" />
                                    New Phrases Discovered
                                </h3>
                                <p className="text-xs text-neutral-500 mb-3">
                                    You asked for help with these phrases during the debate. Save them for future practice!
                                </p>
                                <div className="space-y-2">
                                    {assistedPhrases.map((phrase, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-white/70 rounded-lg border border-blue-100">
                                            <div>
                                                <p className="text-sm font-medium text-neutral-900">{phrase.english}</p>
                                                <p className="text-xs text-neutral-500">{phrase.vietnamese}</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-xs h-7 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                onClick={async () => {
                                                    try {
                                                        const response = await fetch('/api/user/save-phrase', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'x-user-email': user?.email || '',
                                                                'x-user-id': user?.uid || '',
                                                            },
                                                            body: JSON.stringify({
                                                                phrase: phrase.english,
                                                                meaning: `Vietnamese: ${phrase.vietnamese}`,
                                                                context: `Discovered during debate: "${topic}"`,
                                                            }),
                                                        });
                                                        if (response.ok) {
                                                            toast.success(`Saved "${phrase.english}" to your vocab bank!`);
                                                            setAssistedPhrases(prev => prev.filter((_, idx) => idx !== i));
                                                        } else {
                                                            toast.error('Failed to save phrase');
                                                        }
                                                    } catch (error) {
                                                        console.error('Save phrase error:', error);
                                                        toast.error('Failed to save phrase');
                                                    }
                                                }}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Save
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex gap-3 pt-4">
                        <Link href="/practice" className="flex-1">
                            <Button variant="outline" className="w-full h-11 font-sans">Practice More</Button>
                        </Link>
                        <Link href="/feed" className="flex-1">
                            <Button className="w-full h-11 bg-neutral-900 hover:bg-neutral-800 text-white font-sans">Return to Feed</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-4 px-4 flex flex-col h-[calc(100vh-80px)] font-sans">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <Link href="/practice">
                    <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-neutral-900">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Exit
                    </Button>
                </Link>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-normal text-neutral-500 border-neutral-200 bg-white">
                        {topic || 'Debate'}
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={endDebate}
                        disabled={submitting}
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                        End Debate
                    </Button>
                </div>
            </div>

            {/* Background (collapsible) */}
            {background && (
                <div className="mb-6 shrink-0">
                    <button
                        onClick={() => setShowBackground(!showBackground)}
                        className="w-full flex items-center justify-between py-2 text-left group"
                    >
                        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                            Background
                        </span>
                        {showBackground ? (
                            <ChevronUp className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                        )}
                    </button>
                    {showBackground && (
                        <div className="mt-2 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                            <p className="text-neutral-700 text-sm leading-relaxed font-sans">{background}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Phrase checklist */}
            <div className="flex flex-wrap gap-2 mb-6 shrink-0">
                {phrases.map((p, i) => (
                    <Badge
                        key={i}
                        variant="secondary"
                        className={`
                            px-3 py-1 text-sm font-medium transition-all duration-300
                            ${p.used
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 ring-1 ring-emerald-200'
                                : 'bg-white text-neutral-500 border border-neutral-200'
                            }
                        `}
                    >
                        {p.used ? (
                            <CheckCircle className="h-3 w-3 mr-1.5 inline-block" />
                        ) : (
                            <span className="inline-block w-2 H-2 rounded-full bg-neutral-300 mr-1.5" />
                        )}
                        {p.phrase}
                    </Badge>
                ))}
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2 min-h-0">
                {/* Opponent's opening */}
                {opponentPosition && (
                    <div className="flex gap-4 max-w-[90%]">
                        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-neutral-200 shadow-sm">
                            <Bot className="h-5 w-5 text-neutral-900" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-neutral-400 ml-1 block">{opponentPersona}</span>
                            <div className="bg-white border border-neutral-200 rounded-2xl rounded-tl-none p-4 shadow-sm text-neutral-900 leading-relaxed">
                                {opponentPosition}
                            </div>
                        </div>
                    </div>
                )}

                {/* Turns */}
                {turns.map((turn, i) => (
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
                    </div>
                ))}

                {submitting && (
                    <div className="flex gap-4 justify-end max-w-[90%] ml-auto opacity-50">
                        <div className="bg-neutral-900/50 text-white rounded-2xl rounded-tr-none p-4 shadow-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="shrink-0 pt-4 bg-white border-t border-transparent">
                <div className="relative max-w-4xl mx-auto">
                    <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
                        <div className="bg-white/95 backdrop-blur border border-neutral-200 shadow-sm px-4 py-1.5 rounded-full flex items-center gap-3 text-xs font-medium text-neutral-500 pointer-events-auto">
                            <span className={remainingPhrases.length === 0 ? "text-emerald-600 transition-colors" : ""}>
                                {remainingPhrases.length} phrases left
                            </span>
                            <span className="w-px h-3 bg-neutral-200" />
                            <span>
                                Turn {turns.length + 1} / 3
                            </span>
                        </div>
                    </div>

                    {/* Translation suggestion popover */}
                    {(translationSuggestion || translating) && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                            {translating ? (
                                <div className="flex items-center gap-2 text-sm text-blue-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Translating...</span>
                                </div>
                            ) : translationSuggestion && (
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <Languages className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-blue-700 mb-1">Did you mean:</p>
                                            <p className="text-sm text-blue-900">{translationSuggestion.suggestion}</p>
                                        </div>
                                    </div>
                                    {translationSuggestion.translations.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {translationSuggestion.translations.map((t, i) => (
                                                <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                    {t.vietnamese} → {t.english}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-2 mt-2">
                                        <Button
                                            size="sm"
                                            onClick={acceptTranslation}
                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
                                        >
                                            <Sparkles className="h-3 w-3 mr-1" />
                                            Use this
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setTranslationSuggestion(null)}
                                            className="text-blue-600 text-xs h-7"
                                        >
                                            Dismiss
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="relative rounded-2xl border border-neutral-200 bg-white shadow-sm hover:border-neutral-300 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:border-emerald-500/50 transition-all overflow-hidden group">
                        <Textarea
                            value={userMessage}
                            onChange={(e) => handleMessageChange(e.target.value)}
                            placeholder="Type your argument... (Vietnamese text will be auto-translated)"
                            className="min-h-[60px] max-h-[160px] w-full resize-none border-0 bg-transparent p-4 text-base focus-visible:ring-0 placeholder:text-neutral-400 text-neutral-900"
                            disabled={submitting}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                        <div className="flex justify-between items-center px-3 pb-3 bg-white">
                            <p className="text-[10px] text-neutral-400 px-2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                Press Enter to send
                            </p>
                            <Button
                                onClick={handleSubmit}
                                disabled={!userMessage.trim() || submitting}
                                size="sm"
                                className={`
                                    rounded-xl h-9 px-4 transition-all duration-200 font-medium ml-auto
                                    ${!userMessage.trim() || submitting
                                        ? 'bg-neutral-100 text-neutral-300'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg active:scale-95'
                                    }
                                `}
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
