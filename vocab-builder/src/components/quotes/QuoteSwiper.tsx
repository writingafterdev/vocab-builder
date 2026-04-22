'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Quote } from './QuoteCard';
import { ArrowLeft, ArrowRight, Heart } from 'lucide-react';
import { useVocabHighlighter } from '@/components/article/useVocabHighlighter';
import { TapToSelect } from '@/components/vocab/TapToSelect';
import { useDictionaryStore } from '@/stores/dictionary-store';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import FeedCardComponent from '@/components/exercise/FeedCard';
import { TopicPicker } from '@/components/quotes/TopicPicker';
import { cn } from '@/lib/utils';
import { useTTS } from '@/hooks/use-tts';
import type { FeedCard } from '@/lib/db/types';

interface DeckItem {
    id: string;
    type: 'quote' | 'quiz';
    data: any; // Quote | FeedCard
    quizState?: {
        hasAnswered: boolean;
        result: 'correct' | 'wrong' | null;
    };
}

const SWIPE_THRESHOLD = 60;
const VISIBLE_CARDS = 4;

interface QuoteSwiperProps {
    userId: string;
    preGeneratedQuestions?: any[];
    externalTopics?: string[];
    onTopicsChange?: (topics: string[]) => void;
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

const FEED_TOPICS = [
    { id: 'technology', label: 'Technology', emoji: '💻' },
    { id: 'science', label: 'Science', emoji: '🔬' },
    { id: 'business', label: 'Business', emoji: '💼' },
    { id: 'psychology', label: 'Psychology', emoji: '🧠' },
    { id: 'culture', label: 'Culture', emoji: '🏛' },
    { id: 'philosophy', label: 'Philosophy', emoji: '💭' },
    { id: 'world', label: 'World', emoji: '🌍' },
    { id: 'health', label: 'Health', emoji: '❤️‍🩹' },
] as const;

export function QuoteSwiper({ userId, preGeneratedQuestions, externalTopics, onTopicsChange }: QuoteSwiperProps) {
    const router = useRouter();
    const [deck, setDeck] = useState<DeckItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [savedQuotes, setSavedQuotes] = useState<Set<string>>(new Set());
    const [phase, setPhase] = useState<'idle' | 'sending-to-back' | 'bringing-to-front'>('idle');
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const [internalSelectedTopics, setInternalSelectedTopics] = useState<string[]>([]);
    
    // Use external topics if provided, otherwise internal
    const selectedTopics = externalTopics ?? internalSelectedTopics;
    const setSelectedTopics = (updater: string[] | ((prev: string[]) => string[])) => {
        const next = typeof updater === 'function' ? updater(selectedTopics) : updater;
        setInternalSelectedTopics(next);
        onTopicsChange?.(next);
    };
    const isAnimating = useRef(false);
    const cardStackRef = useRef<HTMLDivElement>(null);
    // Master cache of ALL fetched quotes (never wiped on topic change)
    const masterQuotesRef = useRef<DeckItem[]>([]);

    // View tracking: buffer IDs and flush every 5 swipes or on unmount
    const viewedBufferRef = useRef<string[]>([]);
    const FLUSH_EVERY = 5;

    // Dwell-time tracking: implicit preference signal
    const cardShownAtRef = useRef<number>(Date.now());
    const dwellSignalBufferRef = useRef<Array<{ topic: string; weight: number; tags?: string[] }>>([]);

    // Smart Injection state
    const quizQueueRef = useRef<any[]>([]);
    const targetQuizSwipesRef = useRef<Set<number>>(new Set());
    const totalSwipesRef = useRef(0);
    const quizzesInjectedRef = useRef(false);
    const vocabPopupPhraseRef = useRef<string | null>(null);

    const { stop: stopAudio } = useTTS();

    // Global dictionary store (replaces local vocabPopup state)
    const { openPopup: globalOpenPopup, userId: storeUserId, userEmail: storeUserEmail, reviewOpen, reviewCards, loadReviewCards } = useDictionaryStore();
    // Apply rough-notation highlights when active card changes (only for quotes)
    useVocabHighlighter(cardStackRef, [activeIndex, deck]);

    // Drag tracking for the top card
    const dragX = useMotionValue(0);
    const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

    // Reset dwell timer when active card changes
    useEffect(() => {
        cardShownAtRef.current = Date.now();
    }, [activeIndex]);

    // Flush viewed buffer to API (includes dwell-time signals)
    const flushViewedBuffer = useCallback(async (topicBoost?: string, tagsBoost?: string[]) => {
        const ids = [...viewedBufferRef.current];
        const dwellSignals = [...dwellSignalBufferRef.current];
        if (ids.length === 0 && !topicBoost && (!tagsBoost || tagsBoost.length === 0) && dwellSignals.length === 0) return;
        viewedBufferRef.current = [];
        dwellSignalBufferRef.current = [];

        try {
            const { account } = await import('@/lib/appwrite/client');
            let token = null;
            try {
                const jwtRes = await account.createJWT();
                token = jwtRes.jwt;
            } catch(e) {}
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
                    boostTags: tagsBoost,
                    dwellSignals: dwellSignals.length > 0 ? dwellSignals : undefined,
                }),
            });
        } catch (err) {
            console.error('[ViewTracking] Flush failed:', err);
            // Put IDs back in buffer
            viewedBufferRef.current = [...ids, ...viewedBufferRef.current];
            dwellSignalBufferRef.current = [...dwellSignals, ...dwellSignalBufferRef.current];
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

    const fetchMoreQuotes = useCallback(async () => {
        if (!userId || loading) return;
        try {
            const headers: HeadersInit = { 'x-user-id': userId };

            const url = new URL('/api/quotes/get-mixed-quotes', window.location.origin);
            if (selectedTopics.length > 0) {
                url.searchParams.set('explicitTopics', selectedTopics.join(','));
            }

            const quotesRes = await fetch(url.toString(), { 
                headers,
                cache: 'no-store'
            });

            if (quotesRes.ok) {
                const data = await quotesRes.json();
                if (data.needsOnboarding) return;
                
                const fetchedQuotes = data.quotes || [];
                const newItems: DeckItem[] = fetchedQuotes
                    .filter((q: any) => !masterQuotesRef.current.some(d => d.id === q.id))
                    .map((q: any) => ({
                        id: q.id,
                        type: 'quote' as const,
                        data: q
                    }));

                // Add to master cache
                masterQuotesRef.current = [...masterQuotesRef.current, ...newItems];

                // Append to current deck
                setDeck(prevDeck => [...prevDeck, ...newItems]);
            }
        } catch (error) {
            console.error('Failed to fetch more quotes:', error);
        }
    }, [userId, loading, selectedTopics]);

    // Background fetch trigger for infinite doomscrolling
    useEffect(() => {
        if (deck.length > 0 && deck.length - activeIndex <= 6 && !loading) {
            fetchMoreQuotes();
        }
    }, [activeIndex, deck.length, fetchMoreQuotes, loading]);

    useEffect(() => {
        let cancelled = false;
        async function fetchQuotesAndSaved() {
            try {
                // Use userId header only — no JWT needed for read-only quote fetching
                const headers: HeadersInit = { 'x-user-id': userId };

                const [quotesRes, savedRes] = await Promise.all([
                    fetch(`/api/quotes/get-mixed-quotes?${selectedTopics.length > 0 ? `explicitTopics=${selectedTopics.join(',')}` : ''}`, { 
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
                        const newItems: DeckItem[] = fetchedQuotes
                            .filter((q: any) => !masterQuotesRef.current.some(d => d.id === q.id))
                            .map((q: any) => ({
                                id: q.id,
                                type: 'quote' as const,
                                data: q
                            }));

                        // Add to master cache
                        masterQuotesRef.current = [...masterQuotesRef.current, ...newItems];

                        // Build filtered deck from master cache
                        if (selectedTopics.length > 0) {
                            const filtered = masterQuotesRef.current.filter(d => {
                                const topic = (d.data as any)?.topic;
                                return topic && selectedTopics.includes(topic);
                            });
                            setDeck(filtered.length > 0 ? filtered : newItems);
                        } else {
                            setDeck(masterQuotesRef.current);
                        }
                        setActiveIndex(0);
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
    }, [userId, selectedTopics]);

    // Instant client-side filter when topics change (no loading spinner)
    const isInitialMount = useRef(true);
    useEffect(() => {
        // Skip on initial mount (let the fetch handle it)
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        // Instantly filter from master cache
        if (selectedTopics.length > 0) {
            const filtered = masterQuotesRef.current.filter(d => {
                const topic = (d.data as any)?.topic;
                return topic && selectedTopics.includes(topic);
            });
            if (filtered.length > 0) {
                setDeck(filtered);
                setActiveIndex(0);
            }
            // If no cached results for this topic, the fetch effect above will handle it
        } else {
            // Show all cached quotes
            if (masterQuotesRef.current.length > 0) {
                setDeck(masterQuotesRef.current);
                setActiveIndex(0);
            }
        }
    }, [selectedTopics]);

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
        
        // Stop any currently playing audio from quiz cards
        stopAudio();

        // Track viewed quote + compute dwell-time signal
        const currentItem = deck[activeIndex];
        if (currentItem?.type === 'quote' && currentItem.id) {
            viewedBufferRef.current.push(currentItem.id);

            // Dwell-time implicit signal
            const dwellMs = Date.now() - cardShownAtRef.current;
            const quoteData = currentItem.data as any;
            const quoteTopic = quoteData?.topic;
            if (quoteTopic) {
                let dwellWeight = 0;
                if (dwellMs < 1500) {
                    // Quick skip (<1.5s) — user probably isn't interested in this topic
                    dwellWeight = -0.5;
                } else if (dwellMs > 4000) {
                    // Long dwell (>4s) — user is genuinely reading/enjoying this content
                    dwellWeight = 2;
                }
                // Neutral zone (1.5-4s) = no signal (normal reading pace)
                if (dwellWeight !== 0) {
                    dwellSignalBufferRef.current.push({
                        topic: quoteTopic,
                        weight: dwellWeight,
                        tags: quoteData?.tags,
                    });
                }
            }

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
            if (info.offset.x < 0 || info.velocity.x < -300) {
                // Swipe Left -> Next
                sendToBack();
            } else {
                // Swipe Right -> Previous
                animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 25 });
                goPrevious();
            }
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
                const quoteTags = (quote as any).tags;
                if (quoteTopic || quoteTags) {
                    flushViewedBuffer(quoteTopic, quoteTags);
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
        isAnimating.current = true;
        stopAudio();

        // Move index back first, then animate the new front card in
        const prevIndex = activeIndex === 0 ? deck.length - 1 : activeIndex - 1;
        setActiveIndex(prevIndex);
        setPhase('bringing-to-front');

        setTimeout(() => {
            setPhase('idle');
            isAnimating.current = false;
        }, 500);
    };

    const goToArticle = () => {
        stopAudio();
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

        const question = currentItem.data as any;
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

    // Handle lookup from TapToSelect — pipe to global dictionary store
    const handleTapLookup = useCallback((phrase: string, context: string) => {
        if (!storeUserId || !storeUserEmail) return;
        globalOpenPopup(phrase, context, storeUserId, storeUserEmail);
    }, [storeUserId, storeUserEmail, globalOpenPopup]);

    // Handle clicking a highlighted review phrase — also pipe to global store
    const handleHighlightClick = useCallback((phrase: string, context: string) => {
        if (!storeUserId || !storeUserEmail) return;
        globalOpenPopup(phrase, context, storeUserId, storeUserEmail);
    }, [storeUserId, storeUserEmail, globalOpenPopup]);

    // Load review cards when active card text changes
    useEffect(() => {
        const currentItem = deck[activeIndex];
        if (currentItem?.type === 'quote' && storeUserId) {
            loadReviewCards((currentItem.data as Quote).text, storeUserId);
        }
    }, [activeIndex, deck, storeUserId, loadReviewCards]);

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
        if (phase === 'bringing-to-front') {
            // Reverse: the new front card comes from exit/back to front
            if (stackPos === 0) return POSITIONS.front;
            if (stackPos === 1) return POSITIONS.middle;
            if (stackPos === 2) return POSITIONS.back;
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
            <div
                ref={cardStackRef}
                className="relative w-full max-w-[800px] mx-auto h-[310px]"
            >
                {/* Render back to front for proper z-order */}
                {[...cards].reverse().map(({ item, stackPos }) => {
                    const isTop = stackPos === 0;
                    const target = getCardTarget(stackPos);
                    const zIndex = VISIBLE_CARDS - stackPos;

                    return (
                        <motion.div
                            key={item.id}
                            className="absolute inset-x-0 top-0"
                            drag={isTop && phase === 'idle' ? 'x' : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.7}
                            onDragEnd={isTop ? handleDragEnd : undefined}
                            style={
                                isTop && phase === 'idle'
                                    ? { x: dragX, rotate: dragRotate, zIndex, touchAction: 'pan-y' }
                                    : { zIndex: phase === 'sending-to-back' && isTop ? 0 : zIndex }
                            }
                            initial={
                                phase === 'bringing-to-front' && isTop
                                    ? { ...POSITIONS.hidden, x: POSITIONS.hidden.x, rotate: POSITIONS.hidden.rotate }
                                    : false
                            }
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
                                <FeedCardComponent
                                    card={item.data as FeedCard}
                                    onAnswer={(cardId, correct) => {
                                        setDeck(prev => {
                                            const next = [...prev];
                                            const idx = prev.indexOf(item);
                                            if (idx >= 0) {
                                                next[idx] = {
                                                    ...next[idx],
                                                    quizState: { hasAnswered: true, result: correct ? 'correct' : 'wrong' },
                                                };
                                            }
                                            return next;
                                        });
                                        // Auto-advance after answer
                                        setTimeout(() => sendToBack(), 2000);
                                    }}
                                    onFixIt={(sessionId) => router.push(`/practice/session/${sessionId}`)}
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
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-sm">
                                                ✦ Practice Article
                                            </span>
                                        </div>
                                    )}

                                    {/* Quote Text */}
                                    <div className="flex-1 flex items-center px-10 md:px-14 py-8 overflow-y-auto no-scrollbar">
                                        <TapToSelect
                                            text={decodeHtmlEntities((item.data as Quote).text)}
                                            className={cn(
                                                "text-neutral-900 tracking-tight",
                                                (item.data as Quote).text?.length > 250
                                                    ? "text-base md:text-lg md:leading-[1.6]"
                                                    : (item.data as Quote).text?.length > 150
                                                        ? "text-lg md:text-xl md:leading-[1.6]"
                                                        : "text-xl md:text-[24px] md:leading-[1.6]"
                                            )}
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                            onLookup={handleTapLookup}
                                            highlightedPhrases={isTop && reviewOpen ? reviewCards.map(c => c.phrase) : []}
                                            onHighlightClick={handleHighlightClick}
                                            disabled={!isTop}
                                        />
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
                                                        ? "text-neutral-400 hover:text-neutral-900 translate-y-0 opacity-100"
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

            {/* Vocab Popup is now handled globally by DictionaryWidget in layout.tsx */}
        </div>
    );
}
