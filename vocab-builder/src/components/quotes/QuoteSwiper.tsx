'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Quote } from './QuoteCard';
import { ArrowLeft, ArrowRight, Heart } from 'lucide-react';
import { useVocabHighlighter } from '@/components/article/useVocabHighlighter';
import { VocabPopupCard } from '@/components/article/VocabPopupCard';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { QuizCard } from '@/components/exercise/QuizCard';
import { TopicPicker } from '@/components/quotes/TopicPicker';
import { cn } from '@/lib/utils';
import type { InlineQuestion } from '@/lib/db/types';

interface DeckItem {
    id: string;
    type: 'quote' | 'quiz';
    data: any; // Quote | InlineQuestion
    quizState?: {
        hasAnswered: boolean;
        result: 'correct' | 'wrong' | null;
        xpEarned: number;
    };
}

const SWIPE_THRESHOLD = 60;
const VISIBLE_CARDS = 4;

interface QuoteSwiperProps {
    userId: string;
    preGeneratedQuestions?: any[];
}

// Stack position presets: front → middle → back
const POSITIONS = {
    front: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    middle: { y: 14, x: 12, rotate: 3, scale: 0.97, opacity: 1 },
    back: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 1 },
    hidden: { y: 38, x: 8, rotate: -1, scale: 0.91, opacity: 0 },
    exit: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 0 }, // same as back but fades
};

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 18, mass: 1.2 };

/**
 * Decode HTML entities like &#x2014; -> —
 */
function decodeHtmlEntities(text: string): string {
    const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
    if (textarea) {
        textarea.innerHTML = text;
        return textarea.value;
    }
    // Fallback for SSR
    return text
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#x201C;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#x201D;/g, '"')
        .replace(/&#8212;/g, "—")
        .replace(/&#x2014;/g, "—")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

/**
 * Highlight vocab phrases in plain text (wraps matches in <mark> tags)
 */
function highlightQuoteText(rawText: string, phrases: string[]): string {
    const text = decodeHtmlEntities(rawText);
    if (!phrases || phrases.length === 0) return text;

    // Escape HTML first
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const sorted = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of sorted) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
        html = html.replace(regex, '<mark class="vocab-highlight" data-phrase="$1">$1</mark>');
    }
    return html;
}

export function QuoteSwiper({ userId, preGeneratedQuestions }: QuoteSwiperProps) {
    const router = useRouter();
    const [deck, setDeck] = useState<DeckItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [savedQuotes, setSavedQuotes] = useState<Set<string>>(new Set());
    const [phase, setPhase] = useState<'idle' | 'sending-to-back'>('idle');
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const isAnimating = useRef(false);
    const cardStackRef = useRef<HTMLDivElement>(null);

    // View tracking: buffer IDs and flush every 5 swipes or on unmount
    const viewedBufferRef = useRef<string[]>([]);
    const FLUSH_EVERY = 5;

    // Smart Injection state
    const quizQueueRef = useRef<any[]>([]);
    const targetQuizSwipesRef = useRef<Set<number>>(new Set());
    const totalSwipesRef = useRef(0);
    const quizzesInjectedRef = useRef(false);
    const vocabPopupPhraseRef = useRef<string | null>(null);

    // Vocab popup state
    const [vocabPopup, setVocabPopup] = useState<{
        phrase: string;
        meaning: string;
        register?: string | string[];
        nuance?: string | string[];
        context?: string;
        contextTranslation?: string;
        pronunciation?: string;
        topic?: string | string[];
        subtopic?: string;
        isHighFrequency?: boolean;
    } | null>(null);
    const [bounceKey, setBounceKey] = useState(0);
    const [savedPhrases, setSavedPhrases] = useState<Set<string>>(new Set());
    const vocabPopupPhraseRef = useRef<string | null>(null);

    // Apply rough-notation highlights when active card changes (only for quotes)
    useVocabHighlighter(cardStackRef, [activeIndex, deck]);

    // Drag tracking for the top card
    const dragX = useMotionValue(0);
    const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

    // Flush viewed buffer to API
    const flushViewedBuffer = useCallback(async (topicBoost?: string) => {
        const ids = [...viewedBufferRef.current];
        if (ids.length === 0 && !topicBoost) return;
        viewedBufferRef.current = [];

        try {
            const { initializeFirebase } = await import('@/lib/firebase');
            const { auth } = await initializeFirebase();
            const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
            await fetch('/api/quotes/mark-viewed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    quoteIds: ids,
                    boostTopicName: topicBoost,
                }),
            });
        } catch (err) {
            console.error('[ViewTracking] Flush failed:', err);
            // Put IDs back in buffer
            viewedBufferRef.current = [...ids, ...viewedBufferRef.current];
        }
    }, [userId]);

    // Flush on unmount
    useEffect(() => {
        return () => {
            if (viewedBufferRef.current.length > 0) {
                flushViewedBuffer();
            }
        };
    }, [flushViewedBuffer]);

    useEffect(() => {
        let cancelled = false;
        async function fetchQuotesAndSaved() {
            try {
                const { initializeFirebase } = await import('@/lib/firebase');
                const { auth } = await initializeFirebase();
                const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
                const headers: HeadersInit = token
                    ? { 'Authorization': `Bearer ${token}`, 'x-user-id': userId }
                    : { 'x-user-id': userId };

                const [quotesRes, savedRes] = await Promise.all([
                    fetch('/api/quotes/get-mixed-quotes', { 
                        headers,
                        cache: 'no-store'
                    }),
                    fetch('/api/user/saved-quote-ids', { headers })
                ]);

                if (!cancelled) {
                    if (quotesRes.ok) {
                        const data = await quotesRes.json();

                        // Handle onboarding
                        if (data.needsOnboarding) {
                            setNeedsOnboarding(true);
                            setLoading(false);
                            return;
                        }

                        const fetchedQuotes = data.quotes || [];
                        setDeck(fetchedQuotes.map((q: any) => ({
                            id: q.id,
                            type: 'quote',
                            data: q
                        })));
                    }
                    if (savedRes.ok) {
                        const data = await savedRes.json();
                        if (data.quoteIds) {
                            setSavedQuotes(new Set(data.quoteIds));
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch quotes or saved status:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchQuotesAndSaved();
        return () => { cancelled = true; };
    }, [userId]);

    // Store pre-generated questions and calculate smart insertion points
    useEffect(() => {
        if (preGeneratedQuestions && preGeneratedQuestions.length > 0 && !quizzesInjectedRef.current) {
            quizQueueRef.current = [...preGeneratedQuestions];
            
            // Calculate random, distributed swipe indices for injection
            const quizCount = preGeneratedQuestions.length;
            const availableQuotes = deck.filter(d => d.type === 'quote').length;
            
            // If we have more quizzes than quotes (rare), just do every other quote
            // Otherwise, distribute them. We want to avoid injecting on swipe 1 or 2 to let them settle.
            const minWiggleRoom = 2; // minimum swipes between quizzes
            const startOffset = 3;   // don't show quiz before 3rd swipe
            
            const targetSwipes = new Set<number>();
            let currentTarget = startOffset;

            // Distribute roughly evenly, with random jitter
            const averageGap = Math.max(minWiggleRoom, Math.floor(availableQuotes / quizCount));

            for (let i = 0; i < quizCount; i++) {
                // Add some jitter (0 to 2 extra swipes) to make it unpredictable
                const jitter = Math.floor(Math.random() * 3);
                currentTarget += averageGap + (i > 0 ? jitter : 0);
                targetSwipes.add(currentTarget);
            }

            targetQuizSwipesRef.current = targetSwipes;
            console.log(`[QuoteSwiper] Smart Injection map calculated for ${quizCount} quizzes at swipes:`, Array.from(targetSwipes));
        }
    }, [preGeneratedQuestions, deck.length]);

    const sendToBack = () => {
        if (isAnimating.current || deck.length <= 1) return;
        isAnimating.current = true;

        // Track viewed quote
        const currentItem = deck[activeIndex];
        if (currentItem?.type === 'quote' && currentItem.id) {
            viewedBufferRef.current.push(currentItem.id);
            // Flush every N swipes
            if (viewedBufferRef.current.length >= FLUSH_EVERY) {
                flushViewedBuffer();
            }
        }

        // Reset drag position
        animate(dragX, 0, { duration: 0.1 });

        // Phase 1: Animate the front card to the back position
        setPhase('sending-to-back');

        // Phase 2: After animation plays, swap the index
        setTimeout(() => {
            setDeck(prevDeck => {
                const newIndex = (activeIndex + 1) % prevDeck.length;
                const nextCard = prevDeck[newIndex];

                // Smart Injection Logic
                if (nextCard?.type === 'quote') {
                    totalSwipesRef.current += 1;
                    
                    if (
                        targetQuizSwipesRef.current.has(totalSwipesRef.current) &&
                        quizQueueRef.current.length > 0
                    ) {
                        const quizData = quizQueueRef.current.shift()!;
                        quizzesInjectedRef.current = true;

                        const insertPos = newIndex + VISIBLE_CARDS - 1;
                        const quizItem: DeckItem = {
                            id: quizData.id || `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            type: 'quiz',
                            data: quizData,
                            quizState: {
                                hasAnswered: false,
                                result: null,
                                xpEarned: 0,
                            },
                        };

                        const nextDeck = [...prevDeck];
                        nextDeck.splice(insertPos, 0, quizItem);
                        setActiveIndex(newIndex);
                        setPhase('idle');
                        isAnimating.current = false;
                        return nextDeck;
                    }
                }

                setActiveIndex(newIndex);
                setPhase('idle');
                isAnimating.current = false;
                return prevDeck;
            });
        }, 500);
    };

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (Math.abs(info.offset.x) > SWIPE_THRESHOLD || Math.abs(info.velocity.x) > 300) {
            sendToBack();
        } else {
            animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 25 });
        }
    };

    const handleSave = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const currentItem = deck[activeIndex];
        if (currentItem?.type !== 'quote' || !userId) return;
        
        const quote = currentItem.data as Quote;
        
        // Optimistic update
        setSavedQuotes(prev => {
            const next = new Set(prev);
            next.has(quote.id) ? next.delete(quote.id) : next.add(quote.id);
            return next;
        });

        // API call
        try {
            // Extract only needed properties to save payload size and avoid circular refs
            const quoteToSave = {
                id: quote.id,
                text: quote.text,
                postId: quote.postId,
                postTitle: quote.postTitle,
                author: quote.author
            };

            const res = await fetch('/api/user/save-quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ quote: quoteToSave }),
            });

            if (res.ok) {
                // Boost topic on save (❤️ = "more like this")
                const quoteTopic = (quote as any).topic;
                if (quoteTopic) {
                    flushViewedBuffer(quoteTopic);
                }
            } else {
                const data = await res.json();
                import('sonner').then(({ toast }) => toast.error(data.error || 'Failed to save quote'));
                // Revert state
                setSavedQuotes(prev => {
                    const next = new Set(prev);
                    next.has(quote.id) ? next.delete(quote.id) : next.add(quote.id);
                    return next;
                });
            }
        } catch (error) {
            console.error('Failed to save quote:', error);
            import('sonner').then(({ toast }) => toast.error('Check your connection'));
            // Revert state
            setSavedQuotes(prev => {
                const next = new Set(prev);
                next.has(quote.id) ? next.delete(quote.id) : next.add(quote.id);
                return next;
            });
        }
    };

    const goPrevious = () => {
        if (isAnimating.current || deck.length <= 1) return;
        setActiveIndex(prev => (prev === 0 ? deck.length - 1 : prev - 1));
    };

    const goToArticle = () => {
        const item = deck[activeIndex];
        if (!item || item.type !== 'quote') return;
        const quote = item.data as Quote;
        if ((quote as any).sourceType === 'generated_session' && (quote as any).sessionId) {
            router.push(`/practice/session/${(quote as any).sessionId}`);
        } else {
            router.push(`/post/${quote.postId}`);
        }
    };

    // Handle Quiz Answer inside QuoteSwiper
    const handleQuizAnswer = async (answerIndex: number) => {
        const currentItem = deck[activeIndex];
        if (!currentItem || currentItem.type !== 'quiz' || currentItem.quizState?.hasAnswered) return;

        const question = currentItem.data as InlineQuestion;
        const isCorrect = answerIndex === question.correctIndex;
        const resultStatus = isCorrect ? 'correct' : 'wrong';

        // Optimistically update deck state
        setDeck(prev => {
            const next = [...prev];
            next[activeIndex] = {
                ...next[activeIndex],
                quizState: {
                    hasAnswered: true,
                    result: resultStatus,
                    xpEarned: isCorrect ? question.xpReward : 0
                }
            };
            return next;
        });

        // Submit to backend
        try {
            await fetch('/api/exercise/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({
                    phraseId: question.phraseId,
                    questionType: question.questionType,
                    answer: answerIndex,
                    surface: 'quote_swiper',
                    responseTimeMs: 0,
                }),
            });
        } catch (error) {
            console.error('Failed to submit inline exercise:', error);
        }

        // Auto-advance after answering correctly (or let the user read the explanation)
        setTimeout(() => {
            sendToBack();
        }, isCorrect ? 1500 : 3000);
    };

    // Handle clicks on highlighted vocab marks
    const handleMarkClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'MARK' || !target.dataset.phrase) return;

        e.stopPropagation();
        const phrase = (target as any).target?.dataset?.phrase || target.dataset.phrase;
        
        const currentItem = deck[activeIndex];
        const quoteText = currentItem?.type === 'quote' ? (currentItem.data as Quote).text : '';

        // Same phrase clicked again → bounce
        if (vocabPopupPhraseRef.current?.toLowerCase() === phrase.toLowerCase()) {
            setBounceKey(k => k + 1);
            return;
        }

        vocabPopupPhraseRef.current = phrase;
        setBounceKey(0);
        setVocabPopup({
            phrase,
            meaning: 'Looking up...',
            context: quoteText,
        });

        // Fetch phrase data from API
        fetch('/api/user/lookup-phrase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            body: JSON.stringify({ phrase, context: quoteText }),
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data) return;
                const result = data.data || data;
                setVocabPopup(prev => {
                    if (!prev || prev.phrase.toLowerCase() !== phrase.toLowerCase()) return prev;
                    return {
                        ...prev,
                        phrase: prev.phrase,
                        meaning: result.meaning || prev.meaning,
                        register: result.register,
                        nuance: result.nuance,
                        context: result.context || prev.context,
                        contextTranslation: result.contextTranslation,
                        pronunciation: result.pronunciation,
                        topic: result.topic,
                        subtopic: result.subtopic,
                        isHighFrequency: result.isHighFrequency,
                    };
                });
            })
            .catch(err => console.error('Phrase lookup failed:', err));
    }, [activeIndex, deck, userId]);

    // Save phrase to user vocab
    const handleSavePhrase = useCallback(async () => {
        if (!vocabPopup || !userId) return;
        try {
            const res = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({
                    phrase: vocabPopup.phrase,
                    meaning: vocabPopup.meaning,
                    context: vocabPopup.context || '',
                    register: vocabPopup.register || 'consultative',
                    nuance: vocabPopup.nuance,
                    topics: vocabPopup.topic ? (Array.isArray(vocabPopup.topic) ? vocabPopup.topic : [vocabPopup.topic]) : undefined,
                    subtopics: vocabPopup.subtopic ? [vocabPopup.subtopic] : undefined,
                }),
            });
            if (res.ok) {
                setSavedPhrases(prev => new Set(prev).add(vocabPopup.phrase.toLowerCase()));
            }
        } catch (e) {
            console.error('Save phrase failed:', e);
        }
    }, [vocabPopup, userId]);

    // Dismiss popup when card changes
    useEffect(() => {
        setVocabPopup(null);
        vocabPopupPhraseRef.current = null;
    }, [activeIndex]);

    if (loading) {
        return (
            <div className="w-full py-20 flex items-center justify-center">
                <EditorialLoader size="sm" />
            </div>
        );
    }

    // Show topic picker onboarding if needed
    if (needsOnboarding) {
        return (
            <TopicPicker
                userId={userId}
                onComplete={() => {
                    setNeedsOnboarding(false);
                    setLoading(true);
                    // Re-fetch quotes with the new preferences
                    window.location.reload();
                }}
            />
        );
    }

    if (deck.length === 0) return null;

    const currentTop = deck[activeIndex];
    const isSaved = currentTop?.type === 'quote' ? savedQuotes.has(currentTop.id) : false;


    // Determine what each card's target position should be
    const getCardTarget = (stackPos: number) => {
        if (phase === 'sending-to-back') {
            if (stackPos === 0) return POSITIONS.exit;
            if (stackPos === 1) return POSITIONS.front;
            if (stackPos === 2) return POSITIONS.middle;
            if (stackPos === 3) return POSITIONS.back;
            return POSITIONS.hidden;
        }
        if (stackPos === 0) return POSITIONS.front;
        if (stackPos === 1) return POSITIONS.middle;
        if (stackPos === 2) return POSITIONS.back;
        return POSITIONS.hidden;
    };

    // Build the visible stack
    const cards = [];
    for (let i = 0; i < Math.min(VISIBLE_CARDS, deck.length); i++) {
        const idx = (activeIndex + i) % deck.length;
        cards.push({ item: deck[idx], stackPos: i });
    }

    return (
        <div className="relative">
            {/* Card Stack */}
            <div ref={cardStackRef} className="relative w-full max-w-[800px] mx-auto h-[340px]">
                {/* Render back to front for proper z-order */}
                {[...cards].reverse().map(({ item, stackPos }) => {
                    const isTop = stackPos === 0;
                    const target = getCardTarget(stackPos);
                    const zIndex = VISIBLE_CARDS - stackPos;

                    return (
                        <motion.div
                            key={item.id}
                            className="absolute inset-x-0 top-0"
                            style={
                                isTop && phase === 'idle'
                                    ? { x: dragX, rotate: dragRotate, zIndex }
                                    : { zIndex: phase === 'sending-to-back' && isTop ? 0 : zIndex }
                            }
                            initial={false}
                            animate={{
                                y: target.y,
                                x: isTop && phase === 'idle' ? 0 : target.x,
                                rotate: isTop && phase === 'idle' ? 0 : target.rotate,
                                scale: target.scale,
                                opacity: target.opacity,
                            }}
                            transition={SPRING}
                        >
                            {item.type === 'quiz' ? (
                                /* Quiz Card — rendered inline, same size as quote cards */
                                <QuizCard
                                    question={item.data as InlineQuestion}
                                    onAnswer={handleQuizAnswer}
                                    onSkip={() => { sendToBack(); }}
                                    hasAnswered={item.quizState?.hasAnswered || false}
                                    result={item.quizState?.result || null}
                                    xpEarned={item.quizState?.xpEarned || 0}
                                />
                            ) : (
                                /* Regular Quote Card */
                                <div
                                    className="w-full h-[280px] bg-white border border-neutral-200 flex flex-col overflow-hidden transition-shadow duration-300"
                                    style={{
                                        boxShadow: isTop
                                            ? '0 8px 30px -5px rgba(0,0,0,0.12)'
                                            : '0 2px 10px rgba(0,0,0,0.05)',
                                    }}
                                >
                                    {/* Generated session badge */}
                                    {(item.data as any).sourceType === 'generated_session' && (
                                        <div className="absolute top-3 left-3 z-10">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 bg-violet-100 rounded-sm">
                                                ✦ Practice Article
                                            </span>
                                        </div>
                                    )}

                                    {/* Quote Text */}
                                    <div className="flex-1 flex items-center px-10 md:px-14 py-8 overflow-hidden" onClick={isTop ? handleMarkClick : undefined}>
                                        {(item.data as Quote).highlightedPhrases && (item.data as Quote).highlightedPhrases!.length > 0 ? (
                                            <p
                                                className="text-xl md:text-[24px] md:leading-[1.6] text-neutral-900 tracking-tight line-clamp-5"
                                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                                dangerouslySetInnerHTML={{ __html: highlightQuoteText((item.data as Quote).text, (item.data as Quote).highlightedPhrases || []) }}
                                            />
                                        ) : (
                                            <p
                                                className="text-xl md:text-[24px] md:leading-[1.6] text-neutral-900 tracking-tight line-clamp-5"
                                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                            >
                                                {decodeHtmlEntities((item.data as Quote).text)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Bottom bar */}
                                    <div className="flex items-center justify-between px-10 md:px-14 py-4 border-t border-neutral-100">
                                        <div className="flex flex-col min-w-0 flex-1 mr-4">
                                            <span className="text-xs font-medium text-neutral-900 truncate">
                                                {(item.data as Quote).author || 'Unknown'}
                                            </span>
                                            <span className="text-[11px] text-neutral-400 truncate">
                                                {(item.data as Quote).postTitle || 'Untitled'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); goToArticle(); }}
                                            className={cn(
                                                "text-[11px] font-semibold uppercase tracking-[0.15em] whitespace-nowrap flex-shrink-0 transition-all duration-300",
                                                isTop
                                                    ? (item.data as any).sourceType === 'generated_session'
                                                        ? "text-violet-500 hover:text-violet-700 translate-y-0 opacity-100"
                                                        : "text-neutral-400 hover:text-neutral-900 translate-y-0 opacity-100"
                                                    : "text-transparent pointer-events-none translate-y-1 opacity-0"
                                            )}
                                        >
                                            {(item.data as any).sourceType === 'generated_session' ? 'Read Article →' : 'Read Source →'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-6 mt-8">
                <button
                    onClick={goPrevious}
                    className="h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                    aria-label="Previous"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={handleSave}
                    className={`h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 transition-colors ${isSaved ? 'text-red-500 border-red-200 bg-red-50' : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50'}`}
                    aria-label="Save"
                >
                    <Heart className={`w-5 h-5 ${isSaved ? 'fill-current text-red-500' : ''}`} />
                </button>

                <button
                    onClick={sendToBack}
                    className="h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                    aria-label="Next"
                >
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>

            {/* Vocab Popup */}
            <AnimatePresence mode="wait">
                {vocabPopup && (
                    <VocabPopupCard
                        key={vocabPopup.phrase}
                        phrase={vocabPopup.phrase}
                        meaning={vocabPopup.meaning}
                        register={vocabPopup.register}
                        nuance={vocabPopup.nuance}
                        context={vocabPopup.context}
                        contextTranslation={vocabPopup.contextTranslation}
                        pronunciation={vocabPopup.pronunciation}
                        topic={vocabPopup.topic}
                        subtopic={vocabPopup.subtopic}
                        isHighFrequency={vocabPopup.isHighFrequency}
                        bounceKey={bounceKey}
                        onSave={handleSavePhrase}
                        onDismiss={() => { vocabPopupPhraseRef.current = null; setVocabPopup(null); }}
                        isSaved={savedPhrases.has(vocabPopup.phrase.toLowerCase())}
                    />
                )}
            </AnimatePresence>

            {/* Vocab highlight styles */}
            <style jsx global>{`
                .vocab-highlight {
                    background: transparent;
                    color: inherit;
                    cursor: pointer;
                    padding: 0 2px;
                    margin: 0 -2px;
                }
                .vocab-highlight:hover {
                    background: rgba(245, 158, 11, 0.15);
                    border-radius: 2px;
                }
            `}</style>
        </div>
    );
}
