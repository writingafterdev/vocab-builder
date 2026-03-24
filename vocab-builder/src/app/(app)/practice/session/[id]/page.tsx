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
import { AudioSection } from '@/components/exercise/ListeningArticle';

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
    isListeningDay?: boolean;
    reviewDayIndex?: number;
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
            <div className="my-12 p-8 border border-neutral-200 bg-neutral-50">
                <div className="flex items-center gap-2 text-neutral-900 mb-4">
                    <Check className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Completed</span>
                </div>
                <p className="text-[15px] leading-relaxed text-neutral-700 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
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
            className="my-12 relative"
        >
            <div className="bg-white border border-neutral-200 p-8 md:p-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest">
                            Comprehension Check
                        </span>
                    </div>
                    {question.targetPhrase && (
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                            Testing: "{question.targetPhrase}"
                        </span>
                    )}
                </div>

                {/* Question */}
                <p className="text-xl md:text-2xl text-neutral-900 mb-8 leading-relaxed"
                   style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                    {question.question}
                </p>

                {/* Options */}
                <div className="space-y-3">
                    {question.options.map((option, idx) => {
                        let optionStyle = 'border-neutral-200 hover:border-neutral-900 bg-white text-neutral-600 hover:text-neutral-900';
                        if (showResult) {
                            if (idx === question.correctIndex) {
                                optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900';
                            } else if (idx === selectedIndex && !isCorrect) {
                                optionStyle = 'border-red-200 bg-red-50 text-red-900';
                            } else {
                                optionStyle = 'border-neutral-100 bg-neutral-50 text-neutral-400';
                            }
                        } else if (idx === selectedIndex) {
                            optionStyle = 'border-neutral-900 bg-neutral-900 text-white';
                        }

                        return (
                            <button
                                key={idx}
                                onClick={() => !showResult && setSelectedIndex(idx)}
                                disabled={showResult}
                                className={`w-full text-left p-4 md:p-5 border transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 ${optionStyle}`}
                            >
                                <div className="flex items-start gap-4">
                                    <span className={`flex-shrink-0 w-6 h-6 border flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                                        idx === selectedIndex && !showResult ? 'border-neutral-700 text-white' : 'border-current'
                                    }`}>
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span className="text-sm tracking-wide leading-relaxed font-medium">{option}</span>
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
                            className="mt-8 overflow-hidden"
                        >
                            {isCorrect ? (
                                <div className="p-6 border border-emerald-200 bg-emerald-50/50">
                                    <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">
                                        Correct
                                    </h4>
                                    <p className="text-[15px] text-emerald-800 leading-relaxed italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                        {question.explanation}
                                    </p>
                                </div>
                            ) : (
                                <div className="p-6 border border-amber-200 bg-amber-50/50 flex flex-col items-start gap-4">
                                    <div>
                                        <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-3">
                                            {attempts < 3 ? 'Incorrect' : 'Answer'}
                                        </h4>
                                        {attempts >= 3 && (
                                            <p className="text-[15px] text-amber-800 leading-relaxed italic mb-4" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                                {question.explanation}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={attempts >= 3 ? onCorrect : handleRetry}
                                        className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 border-b border-neutral-900 pb-0.5 hover:text-neutral-500 hover:border-neutral-500 transition-colors"
                                    >
                                        {attempts >= 3 ? 'Continue reading' : 'Try again'}
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
                        className={`mt-8 w-full py-4 text-[10px] font-bold uppercase tracking-widest transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                            selectedIndex !== null
                                ? 'bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:ring-neutral-900'
                                : 'bg-neutral-50 text-neutral-300 border border-neutral-200 cursor-not-allowed'
                        }`}
                    >
                        Check Answer
                    </button>
                )}
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
    const { user } = useAuth();
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const isOwner = user?.$id === session.userId;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-[60vh] flex items-center justify-center py-20"
        >
            <div className="text-center max-w-md mx-auto px-6">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="w-20 h-20 bg-neutral-900 rounded-none flex items-center justify-center mx-auto mb-8"
                >
                    <Trophy className="w-8 h-8 text-white" />
                </motion.div>

                <h2
                    className="text-3xl md:text-4xl font-normal text-neutral-900 mb-4"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    Session Complete
                </h2>

                {isOwner ? (
                    <p className="text-neutral-500 mb-10 tracking-wide font-medium">
                        You reviewed {session.totalPhrases} phrases with {accuracy}% accuracy.
                    </p>
                ) : (
                    <p className="text-emerald-600 mb-10 tracking-wide font-medium text-sm">
                        You helped verify a community article with {accuracy}% accuracy!
                    </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-10">
                    <div className="p-5 bg-neutral-50 border border-neutral-100">
                        <div className="text-[28px] font-normal font-serif text-neutral-900">{session.totalPhrases}</div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-400 mt-2 font-bold">Phrases</div>
                    </div>
                    <div className="p-5 bg-neutral-50 border border-neutral-100">
                        <div className="text-[28px] font-normal font-serif text-neutral-900">{correctCount}</div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-400 mt-2 font-bold">Correct</div>
                    </div>
                    <div className="p-5 bg-neutral-50 border border-neutral-100">
                        <div className="text-[28px] font-normal font-serif text-neutral-900">{accuracy}%</div>
                        <div className="text-[10px] uppercase tracking-widest text-emerald-600 mt-2 font-bold">Accuracy</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => router.push('/feed')}
                        className="w-full py-4 bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-colors border border-neutral-900"
                    >
                        Back to Library
                    </button>
                    <button
                        onClick={() => router.push('/practice')}
                        className="w-full py-4 bg-white text-neutral-900 border border-neutral-200 text-[10px] font-bold uppercase tracking-widest hover:border-neutral-900 hover:bg-neutral-50 transition-colors"
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
            if (!sessionId || !user?.$id) return;

            try {
                const res = await fetch(`/api/practice/get-session?sessionId=${sessionId}`, {
                    headers: { 'x-user-id': user.$id },
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
    }, [sessionId, user?.$id]);

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
                            'x-user-id': user?.$id || '',
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
    }, [session, completedQuestionIds, sessionId, user?.$id, firstAttemptCorrect]);

    const handleListeningComplete = useCallback(async () => {
        if (!session) return;
        setIsCompleted(true);

        try {
            await fetch('/api/practice/complete-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user?.$id || '',
                },
                body: JSON.stringify({
                    sessionId,
                    phraseIds: session.phraseIds,
                    correctCount: session.questions.length, // Full credit for now
                    totalQuestions: session.questions.length,
                }),
            });
        } catch (e) {
            console.error('Failed to complete session:', e);
        }
    }, [session, sessionId, user?.$id]);

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
            <div className="max-w-[900px] mx-auto py-12 md:py-20 px-4 md:px-6 pb-32">
                <article className="bg-white shadow-[0_4px_50px_rgba(0,0,0,0.12)] min-h-[80vh] px-10 md:px-20 py-14 md:py-20">
                        {/* Title */}
                        <header className="text-center mb-10">
                            <div className="inline-block px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-violet-600 rounded-sm mb-4">
                                Practice Session
                            </div>
                            <h1
                                className="text-3xl md:text-[44px] md:leading-[1.15] font-normal text-neutral-900 tracking-tight mb-4"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                {session.title}
                            </h1>
                            <p
                                className="text-sm md:text-base text-neutral-500 italic max-w-[500px] mx-auto"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                {session.subtitle}
                            </p>
                            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-neutral-400 font-sans">
                                <span>{session.sections.length} sections</span>
                                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                                <span>{session.questions.length} questions</span>
                                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                                <span>{session.totalPhrases} vocab phrases</span>
                            </div>
                        </header>

                        {/* Divider */}
                        <div className="w-full border-t border-neutral-200 mb-10" />

                        {/* Reading flow */}
                        <div className="prose prose-neutral max-w-none leading-[1.9] text-[17px] text-neutral-800 prose-headings:font-sans prose-headings:font-bold prose-p:mb-6" style={{ fontFamily: 'Georgia, serif' }}>
                            {readingFlow.map((item, index) => {
                                const isBeyondGate = firstUnansweredIndex >= 0 && index > firstUnansweredIndex;

                                if (item.type === 'section') {
                                    if (session.isListeningDay) {
                                        return (
                                            <AudioSection 
                                                key={item.data.id}
                                                section={item.data}
                                                isBeyondGate={isBeyondGate}
                                                isPassed={firstUnansweredIndex >= 0 ? index < firstUnansweredIndex : true}
                                                isActive={firstUnansweredIndex >= 0 ? index === firstUnansweredIndex || index === firstUnansweredIndex - 1 : true}
                                            />
                                        )
                                    }

                                    return (
                                        <div key={item.data.id} className="relative">
                                            <div
                                                className={`transition-all duration-500 ${
                                                    isBeyondGate ? 'blur-sm select-none pointer-events-none opacity-50' : ''
                                                }`}
                                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
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
                                                    <div className="bg-white/80 backdrop-blur-sm border border-neutral-200 rounded-xl px-6 py-4 shadow-lg text-center" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                                                        <Lock className="w-5 h-5 text-neutral-400 mx-auto mb-2" />
                                                        <p className="text-sm font-semibold text-neutral-700">
                                                            {session.isListeningDay ? 'Answer the question above to continue listening' : 'Answer the question above to continue reading'}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                if (item.type === 'question') {
                                    return (
                                        <div className="font-sans" key={item.data.id}>
                                            <QuestionGate
                                                question={item.data}
                                                isCompleted={completedQuestionIds.has(item.data.id)}
                                                onCorrect={() => handleQuestionCorrect(item.data.id)}
                                            />
                                        </div>
                                    );
                                }

                                return null;
                            })}
                        </div>

                    {/* Open-production writing prompt — shown when all questions are answered */}
                    {firstUnansweredIndex === -1 && !isCompleted && session && (
                        <WritingPromptCard
                            phrases={session.sections.flatMap(s => s.vocabPhrases).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4)}
                            userId={user?.$id || ''}
                        />
                    )}
                    </article>
                </div>
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
            const { account } = await import('@/lib/appwrite/client');
            let token = null;
            try {
                const jwtRes = await account.createJWT();
                token = jwtRes.jwt;
            } catch(e) {}

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
            className="my-12 relative"
        >
            <div className="bg-white border border-neutral-200 p-8 md:p-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-neutral-400" />
                        <span className="text-[10px] font-bold text-neutral-900 uppercase tracking-widest">
                            Your Turn
                        </span>
                    </div>
                    <button
                        onClick={() => setSkipped(true)}
                        className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:text-neutral-900 transition-colors"
                    >
                        Skip
                    </button>
                </div>

                <div className="">
                    {!feedback ? (
                        <>
                            <h3
                                className="text-xl md:text-2xl text-neutral-900 mb-4"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                Use these phrases in a short paragraph
                            </h3>
                            <div className="flex flex-wrap gap-2 mb-8">
                                {targetPhrases.map((phrase, i) => (
                                    <span
                                        key={i}
                                        className="px-3 py-1.5 border border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-600 bg-neutral-50"
                                    >
                                        {phrase}
                                    </span>
                                ))}
                            </div>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                placeholder="Write naturally (3-5 sentences)..."
                                rows={5}
                                className="w-full bg-white border border-neutral-200 p-5 text-sm md:text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 resize-none font-serif leading-relaxed"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={response.trim().length < 20 || isSubmitting}
                                className={`mt-6 w-full py-4 text-[10px] font-bold uppercase tracking-widest transition-all ${
                                    response.trim().length >= 20
                                        ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                                        : 'bg-neutral-50 border border-neutral-200 text-neutral-400 cursor-not-allowed'
                                }`}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Evaluating
                                    </span>
                                ) : (
                                    'Check My Writing'
                                )}
                            </button>
                        </>
                    ) : (
                        <div>
                            <h3
                                className="text-xl md:text-2xl text-neutral-900 mb-6"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                Naturalness Report
                            </h3>
                            <div className="space-y-4">
                                {feedback.detections.map((d, i) => (
                                    <div key={i} className="bg-white border border-neutral-200 p-5">
                                        <div className="flex items-center gap-3 mb-3">
                                            <span>{tierEmoji(d.tier)}</span>
                                            <span className="text-sm font-semibold text-neutral-900 tracking-wide font-medium">
                                                "{d.phrase}"
                                            </span>
                                            <span className={`text-[10px] border px-2 py-0.5 uppercase tracking-widest font-bold ${
                                                d.tier === 'NATURAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                d.tier === 'ACCEPTABLE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                d.tier === 'FORCED' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                'bg-neutral-50 text-neutral-500 border-neutral-200'
                                            }`}>
                                                {d.tier}
                                            </span>
                                        </div>
                                        <p className="text-[15px] text-neutral-700 leading-relaxed italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
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

