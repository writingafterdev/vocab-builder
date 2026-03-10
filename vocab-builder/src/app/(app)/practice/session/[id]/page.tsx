'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Check, ChevronRight, Loader2, BookOpen,
    Trophy, Sparkles, Lock,
} from 'lucide-react';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────

interface GeneratedSection {
    id: string;
    content: string;
    vocabPhrases: string[];
}

interface ComprehensionQuestion {
    id: string;
    afterSectionId: string;
    question: string;
    options: string[];
    correctIndex: number;
    targetPhrase: string;
    explanation: string;
}

interface GeneratedSession {
    userId: string;
    title: string;
    subtitle: string;
    sections: GeneratedSection[];
    questions: ComprehensionQuestion[];
    quotes: Array<{ text: string; highlightedPhrases: string[] }>;
    phraseIds: string[];
    totalPhrases: number;
    status: 'generated' | 'in_progress' | 'completed';
    createdAt: string;
}

// ─── Question Card (non-skippable) ────────────────────

function QuestionGate({
    question,
    onCorrect,
    isCompleted,
}: {
    question: ComprehensionQuestion;
    onCorrect: () => void;
    isCompleted: boolean;
}) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [attempts, setAttempts] = useState(0);

    if (isCompleted) {
        return (
            <div className="my-8 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <div className="flex items-center gap-2 text-emerald-700">
                    <Check className="w-5 h-5" />
                    <span className="text-sm font-semibold">Completed</span>
                </div>
                <p className="text-sm text-emerald-600 mt-2 italic">
                    {question.explanation}
                </p>
            </div>
        );
    }

    const handleSubmit = () => {
        if (selectedIndex === null) return;

        const correct = selectedIndex === question.correctIndex;
        setIsCorrect(correct);
        setShowResult(true);
        setAttempts(prev => prev + 1);

        if (correct) {
            setTimeout(() => onCorrect(), 1500);
        }
    };

    const handleRetry = () => {
        setSelectedIndex(null);
        setShowResult(false);
        setIsCorrect(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-8 relative"
        >
            {/* Question card */}
            <div className="bg-white border-2 border-neutral-900 rounded-2xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                {/* Header */}
                <div className="bg-neutral-900 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Comprehension Check
                        </span>
                    </div>
                    <span className="text-xs text-neutral-400">
                        {question.targetPhrase && `Testing: "${question.targetPhrase}"`}
                    </span>
                </div>

                {/* Question */}
                <div className="p-6">
                    <p className="text-lg font-medium text-neutral-900 leading-relaxed mb-6"
                       style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>
                        {question.question}
                    </p>

                    {/* Options */}
                    <div className="space-y-3">
                        {question.options.map((option, idx) => {
                            let optionStyle = 'border-neutral-200 hover:border-neutral-400 bg-white';
                            if (showResult) {
                                if (idx === question.correctIndex) {
                                    optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900';
                                } else if (idx === selectedIndex && !isCorrect) {
                                    optionStyle = 'border-red-400 bg-red-50 text-red-800';
                                } else {
                                    optionStyle = 'border-neutral-100 bg-neutral-50 text-neutral-400';
                                }
                            } else if (idx === selectedIndex) {
                                optionStyle = 'border-neutral-900 bg-neutral-50';
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => !showResult && setSelectedIndex(idx)}
                                    disabled={showResult}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${optionStyle}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold mt-0.5">
                                            {String.fromCharCode(65 + idx)}
                                        </span>
                                        <span className="text-sm leading-relaxed">{option}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Result feedback */}
                    <AnimatePresence>
                        {showResult && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-6"
                            >
                                {isCorrect ? (
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-lg">🎯</span>
                                            <span className="text-sm font-bold text-emerald-700">Nailed it!</span>
                                        </div>
                                        <p className="text-sm text-emerald-600 leading-relaxed">
                                            {question.explanation}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-lg">🤔</span>
                                            <span className="text-sm font-bold text-amber-700">
                                                Not quite — {attempts < 3 ? 'try again!' : 'here\'s the answer'}
                                            </span>
                                        </div>
                                        {attempts >= 3 && (
                                            <p className="text-sm text-amber-600 leading-relaxed mb-3">
                                                {question.explanation}
                                            </p>
                                        )}
                                        <button
                                            onClick={attempts >= 3 ? onCorrect : handleRetry}
                                            className="text-sm font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
                                        >
                                            {attempts >= 3 ? 'Continue reading →' : 'Try again →'}
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Submit button */}
                    {!showResult && (
                        <button
                            onClick={handleSubmit}
                            disabled={selectedIndex === null}
                            className={`mt-6 w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                                selectedIndex !== null
                                    ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-lg'
                                    : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                            }`}
                        >
                            Check Answer
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Progress Bar ─────────────────────────────────────

function SessionProgress({
    completed,
    total,
}: {
    completed: number;
    total: number;
}) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-neutral-900 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>
            <span className="text-xs text-neutral-400 font-medium tabular-nums">
                {completed}/{total}
            </span>
        </div>
    );
}

// ─── Completion Screen ────────────────────────────────

function CompletionScreen({
    session,
    correctCount,
    totalQuestions,
}: {
    session: GeneratedSession;
    correctCount: number;
    totalQuestions: number;
}) {
    const router = useRouter();
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-[60vh] flex items-center justify-center"
        >
            <div className="text-center max-w-md mx-auto px-6">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                    <Trophy className="w-10 h-10 text-amber-400" />
                </motion.div>

                <h2
                    className="text-3xl font-normal text-neutral-900 mb-2"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    Session Complete
                </h2>

                <p className="text-neutral-500 mb-8">
                    You reviewed {session.totalPhrases} phrases with {accuracy}% accuracy.
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="p-4 bg-neutral-50 rounded-xl">
                        <div className="text-2xl font-bold text-neutral-900">{session.totalPhrases}</div>
                        <div className="text-xs text-neutral-400 mt-1">Phrases</div>
                    </div>
                    <div className="p-4 bg-neutral-50 rounded-xl">
                        <div className="text-2xl font-bold text-neutral-900">{correctCount}</div>
                        <div className="text-xs text-neutral-400 mt-1">Correct</div>
                    </div>
                    <div className="p-4 bg-neutral-50 rounded-xl">
                        <div className="text-2xl font-bold text-emerald-600">{accuracy}%</div>
                        <div className="text-xs text-neutral-400 mt-1">Accuracy</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => router.push('/feed')}
                        className="w-full py-3.5 bg-neutral-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors"
                    >
                        Back to Feed
                    </button>
                    <button
                        onClick={() => router.push('/practice')}
                        className="w-full py-3.5 bg-neutral-100 text-neutral-700 rounded-xl text-sm font-semibold hover:bg-neutral-200 transition-colors"
                    >
                        Start Another Session
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Main Page ────────────────────────────────────────

export default function SessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;
    const { user } = useAuth();

    const [session, setSession] = useState<GeneratedSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [completedQuestionIds, setCompletedQuestionIds] = useState<Set<string>>(new Set());
    const [firstAttemptCorrect, setFirstAttemptCorrect] = useState<Set<string>>(new Set());
    const [isCompleted, setIsCompleted] = useState(false);

    // Load session data
    useEffect(() => {
        async function loadSession() {
            if (!sessionId || !user?.uid) return;

            try {
                const res = await fetch(`/api/practice/get-session?sessionId=${sessionId}`, {
                    headers: { 'x-user-id': user.uid },
                });

                if (!res.ok) {
                    throw new Error('Session not found');
                }

                const data = await res.json();
                setSession(data.session);
            } catch (err) {
                console.error('Failed to load session:', err);
                setError('Session not found or expired.');
            } finally {
                setLoading(false);
            }
        }

        loadSession();
    }, [sessionId, user?.uid]);

    // Build the reading flow: sections interleaved with questions
    const readingFlow = useMemo(() => {
        if (!session) return [];

        const flow: Array<
            | { type: 'section'; data: GeneratedSection }
            | { type: 'question'; data: ComprehensionQuestion }
        > = [];

        for (const section of session.sections) {
            flow.push({ type: 'section', data: section });

            // Insert questions that go after this section
            const questionsAfter = session.questions.filter(
                q => q.afterSectionId === section.id
            );
            for (const q of questionsAfter) {
                flow.push({ type: 'question', data: q });
            }
        }

        return flow;
    }, [session]);

    // Find the first unanswered question to determine blur boundary
    const firstUnansweredIndex = useMemo(() => {
        for (let i = 0; i < readingFlow.length; i++) {
            const item = readingFlow[i];
            if (item.type === 'question' && !completedQuestionIds.has(item.data.id)) {
                return i;
            }
        }
        return -1; // All completed
    }, [readingFlow, completedQuestionIds]);

    const handleQuestionCorrect = useCallback(async (questionId: string) => {
        setCompletedQuestionIds(prev => {
            const next = new Set(prev);
            next.add(questionId);
            return next;
        });

        // Check if this was the last question
        if (session) {
            const allCompleted = session.questions.every(
                q => completedQuestionIds.has(q.id) || q.id === questionId
            );

            if (allCompleted) {
                // Mark session as completed + update SRS
                setIsCompleted(true);

                try {
                    await fetch('/api/practice/complete-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user?.uid || '',
                        },
                        body: JSON.stringify({
                            sessionId,
                            phraseIds: session.phraseIds,
                            correctCount: firstAttemptCorrect.size + 1,
                            totalQuestions: session.questions.length,
                        }),
                    });
                } catch (e) {
                    console.error('Failed to complete session:', e);
                }
            }
        }
    }, [session, completedQuestionIds, sessionId, user?.uid, firstAttemptCorrect]);

    // Highlight vocab phrases in section content
    const highlightPhrases = useCallback((content: string, phrases: string[]) => {
        if (!phrases || phrases.length === 0) return content;

        let result = content;
        for (const phrase of phrases) {
            const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            result = result.replace(
                regex,
                '<mark class="bg-amber-100 text-amber-900 px-1 rounded font-medium">$1</mark>'
            );
        }
        return result;
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
                <BookOpen className="w-12 h-12 text-neutral-300" />
                <p className="text-neutral-500">{error || 'Session not found'}</p>
                <Link
                    href="/practice"
                    className="text-sm font-semibold text-neutral-900 underline underline-offset-2"
                >
                    ← Back to Practice
                </Link>
            </div>
        );
    }

    if (isCompleted) {
        return (
            <div className="min-h-screen bg-white">
                <CompletionScreen
                    session={session}
                    correctCount={firstAttemptCorrect.size}
                    totalQuestions={session.questions.length}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Sticky header */}
            <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-neutral-100">
                <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-xs font-medium">Back</span>
                    </button>

                    <SessionProgress
                        completed={completedQuestionIds.size}
                        total={session.questions.length}
                    />

                    <div className="flex items-center gap-1.5 text-neutral-400">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-semibold">
                            {session.totalPhrases} phrases
                        </span>
                    </div>
                </div>
            </header>

            {/* Article content */}
            <article className="max-w-2xl mx-auto px-6 py-12">
                {/* Title */}
                <header className="mb-12">
                    <div className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-violet-600 rounded-sm mb-4">
                        Practice Session
                    </div>
                    <h1
                        className="text-4xl md:text-5xl font-normal text-neutral-900 leading-tight tracking-tight mb-4"
                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                    >
                        {session.title}
                    </h1>
                    <p className="text-lg text-neutral-500 leading-relaxed">
                        {session.subtitle}
                    </p>
                    <div className="mt-6 flex items-center gap-4 text-xs text-neutral-400">
                        <span>{session.sections.length} sections</span>
                        <span className="w-1 h-1 rounded-full bg-neutral-300" />
                        <span>{session.questions.length} questions</span>
                        <span className="w-1 h-1 rounded-full bg-neutral-300" />
                        <span>{session.totalPhrases} vocab phrases</span>
                    </div>
                </header>

                {/* Reading flow */}
                {readingFlow.map((item, index) => {
                    const isBeyondGate = firstUnansweredIndex >= 0 && index > firstUnansweredIndex;

                    if (item.type === 'section') {
                        return (
                            <div key={item.data.id} className="relative">
                                <div
                                    className={`prose prose-lg prose-neutral max-w-none mb-8 transition-all duration-500 ${
                                        isBeyondGate ? 'blur-md select-none pointer-events-none opacity-50' : ''
                                    }`}
                                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightPhrases(
                                            // Convert newlines to paragraphs
                                            item.data.content
                                                .split('\n\n')
                                                .filter(p => p.trim())
                                                .map(p => `<p>${p.trim()}</p>`)
                                                .join(''),
                                            item.data.vocabPhrases
                                        ),
                                    }}
                                />
                                {/* Blur overlay message */}
                                {isBeyondGate && index === firstUnansweredIndex + 1 && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="bg-white/80 backdrop-blur-sm border border-neutral-200 rounded-xl px-6 py-4 shadow-lg text-center">
                                            <Lock className="w-5 h-5 text-neutral-400 mx-auto mb-2" />
                                            <p className="text-sm font-semibold text-neutral-700">
                                                Answer the question above to continue reading
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    if (item.type === 'question') {
                        return (
                            <QuestionGate
                                key={item.data.id}
                                question={item.data}
                                isCompleted={completedQuestionIds.has(item.data.id)}
                                onCorrect={() => handleQuestionCorrect(item.data.id)}
                            />
                        );
                    }

                    return null;
                })}

                {/* Open-production writing prompt — shown when all questions are answered */}
                {firstUnansweredIndex === -1 && !isCompleted && session && (
                    <WritingPromptCard
                        phrases={session.sections.flatMap(s => s.vocabPhrases).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4)}
                        userId={user?.uid || ''}
                    />
                )}
            </article>
        </div>
    );
}

// ─── Open-Production Writing Prompt ───────────────────

function WritingPromptCard({
    phrases,
    userId,
}: {
    phrases: string[];
    userId: string;
}) {
    const [response, setResponse] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{
        detections: Array<{
            phrase: string;
            detected: boolean;
            tier: string;
            reasoning: string;
        }>;
    } | null>(null);
    const [skipped, setSkipped] = useState(false);

    const targetPhrases = phrases.slice(0, 3);

    if (skipped) return null;

    const handleSubmit = async () => {
        if (!response.trim() || isSubmitting) return;
        setIsSubmitting(true);

        try {
            const { initializeFirebase } = await import('@/lib/firebase');
            const { auth } = await initializeFirebase();
            const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;

            const res = await fetch('/api/exercise/evaluate-production', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    targetPhrases,
                    userResponse: response,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setFeedback(data);
            } else {
                toast.error('Couldn\'t evaluate your response');
            }
        } catch (err) {
            console.error('Production eval failed:', err);
            toast.error('Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    const tierEmoji = (tier: string) => {
        switch (tier) {
            case 'NATURAL': return '🟢';
            case 'ACCEPTABLE': return '🟡';
            case 'FORCED': return '🟠';
            case 'NOT_USED': return '⚪';
            default: return '🔴';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-12"
        >
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border-2 border-violet-200 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-violet-600 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-200" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Your Turn
                        </span>
                    </div>
                    <button
                        onClick={() => setSkipped(true)}
                        className="text-xs text-violet-300 hover:text-white transition-colors"
                    >
                        Skip →
                    </button>
                </div>

                <div className="p-6">
                    {!feedback ? (
                        <>
                            <h3
                                className="text-xl font-normal text-neutral-900 mb-2"
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                Now use them yourself
                            </h3>
                            <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
                                Write a short paragraph (3-5 sentences) that naturally uses at least 2 of these phrases:
                            </p>
                            <div className="flex flex-wrap gap-2 mb-5">
                                {targetPhrases.map((phrase, i) => (
                                    <span
                                        key={i}
                                        className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-sm font-medium text-violet-700"
                                    >
                                        {phrase}
                                    </span>
                                ))}
                            </div>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                placeholder="Write naturally — pretend you're telling a story or explaining something to a friend..."
                                rows={5}
                                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent resize-none"
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={response.trim().length < 20 || isSubmitting}
                                className={`mt-4 w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                                    response.trim().length >= 20
                                        ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg'
                                        : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                }`}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Evaluating...
                                    </span>
                                ) : (
                                    'Check My Writing'
                                )}
                            </button>
                        </>
                    ) : (
                        <div>
                            <h3
                                className="text-xl font-normal text-neutral-900 mb-4"
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                Naturalness Report
                            </h3>
                            <div className="space-y-3">
                                {feedback.detections.map((d, i) => (
                                    <div key={i} className="bg-white rounded-xl p-4 border border-neutral-100">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span>{tierEmoji(d.tier)}</span>
                                            <span className="text-sm font-semibold text-neutral-900">
                                                "{d.phrase}"
                                            </span>
                                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                                                d.tier === 'NATURAL' ? 'bg-emerald-100 text-emerald-700' :
                                                d.tier === 'ACCEPTABLE' ? 'bg-amber-100 text-amber-700' :
                                                d.tier === 'FORCED' ? 'bg-orange-100 text-orange-700' :
                                                'bg-neutral-100 text-neutral-500'
                                            }`}>
                                                {d.tier}
                                            </span>
                                        </div>
                                        <p className="text-xs text-neutral-500 leading-relaxed">
                                            {d.reasoning}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

