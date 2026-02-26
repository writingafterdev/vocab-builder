'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Quote } from './QuoteCard';
import { ArrowLeft, ArrowRight, Heart } from 'lucide-react';
import { useVocabHighlighter } from '@/components/article/useVocabHighlighter';
import { VocabPopupCard } from '@/components/article/VocabPopupCard';
import { EditorialLoader } from '@/components/ui/editorial-loader';

const SWIPE_THRESHOLD = 60;
const VISIBLE_CARDS = 3;

interface QuoteSwiperProps {
    userId: string;
}

// Stack position presets: front → middle → back
const POSITIONS = {
    front: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    middle: { y: 14, x: 12, rotate: 3, scale: 0.97, opacity: 1 },
    back: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 1 },
    exit: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 0 }, // same as back but fades
};

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 18, mass: 1.2 };

/**
 * Highlight vocab phrases in plain text (wraps matches in <mark> tags)
 */
function highlightQuoteText(text: string, phrases: string[]): string {
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

export function QuoteSwiper({ userId }: QuoteSwiperProps) {
    const router = useRouter();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [savedQuotes, setSavedQuotes] = useState<Set<string>>(new Set());
    const [phase, setPhase] = useState<'idle' | 'sending-to-back'>('idle');
    const isAnimating = useRef(false);
    const cardStackRef = useRef<HTMLDivElement>(null);

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
        isHighFrequency?: boolean;
    } | null>(null);
    const [bounceKey, setBounceKey] = useState(0);
    const [savedPhrases, setSavedPhrases] = useState<Set<string>>(new Set());
    const vocabPopupPhraseRef = useRef<string | null>(null);

    // Apply rough-notation highlights when active card changes
    useVocabHighlighter(cardStackRef, [activeIndex, quotes]);

    // Drag tracking for the top card
    const dragX = useMotionValue(0);
    const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

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
                    fetch('/api/quotes/get-mixed-quotes', { headers }),
                    fetch('/api/user/saved-quote-ids', { headers })
                ]);

                if (!cancelled) {
                    if (quotesRes.ok) {
                        const data = await quotesRes.json();
                        setQuotes(data.quotes || []);
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

    const sendToBack = () => {
        if (isAnimating.current || quotes.length <= 1) return;
        isAnimating.current = true;

        // Reset drag position
        animate(dragX, 0, { duration: 0.1 });

        // Phase 1: Animate the front card to the back position
        setPhase('sending-to-back');

        // Phase 2: After animation plays, swap the index
        setTimeout(() => {
            setActiveIndex(prev => (prev + 1) % quotes.length);
            setPhase('idle');
            isAnimating.current = false;
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
        const quote = quotes[activeIndex];
        if (quote && userId) {
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

                if (!res.ok) {
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
        }
    };

    const goPrevious = () => {
        if (isAnimating.current || quotes.length <= 1) return;
        setActiveIndex(prev => (prev === 0 ? quotes.length - 1 : prev - 1));
    };

    const goToArticle = () => {
        const quote = quotes[activeIndex];
        if (quote) router.push(`/post/${quote.postId}`);
    };

    // Handle clicks on highlighted vocab marks
    const handleMarkClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'MARK' || !target.dataset.phrase) return;

        e.stopPropagation();
        const phrase = target.dataset.phrase;
        const quoteText = quotes[activeIndex]?.text || '';

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
                setVocabPopup(prev =>
                    prev?.phrase.toLowerCase() === phrase.toLowerCase()
                        ? {
                            ...prev,
                            meaning: result.meaning || prev.meaning,
                            register: result.register,
                            nuance: result.nuance,
                            context: result.context || prev.context,
                            contextTranslation: result.contextTranslation,
                            pronunciation: result.pronunciation,
                            topic: result.topic,
                            isHighFrequency: result.isHighFrequency,
                        }
                        : prev
                );
            })
            .catch(err => console.error('Phrase lookup failed:', err));
    }, [activeIndex, quotes, userId]);

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

    if (quotes.length === 0) return null;

    const isSaved = savedQuotes.has(quotes[activeIndex].id);

    // Determine what each card's target position should be
    const getCardTarget = (stackPos: number) => {
        if (stackPos === 0 && phase === 'sending-to-back') {
            // Front card → animate to the exit (back) position
            return POSITIONS.exit;
        }
        if (stackPos === 0) return POSITIONS.front;
        if (stackPos === 1) return POSITIONS.middle;
        return POSITIONS.back;
    };

    // Build the visible stack
    const cards = [];
    for (let i = 0; i < Math.min(VISIBLE_CARDS, quotes.length); i++) {
        const idx = (activeIndex + i) % quotes.length;
        cards.push({ quote: quotes[idx], stackPos: i });
    }

    return (
        <div className="relative">
            {/* Card Stack */}
            <div ref={cardStackRef} className="relative w-full max-w-[800px] mx-auto h-[340px]">
                {/* Render back to front for proper z-order */}
                {[...cards].reverse().map(({ quote, stackPos }) => {
                    const isTop = stackPos === 0;
                    const target = getCardTarget(stackPos);
                    const zIndex = VISIBLE_CARDS - stackPos;

                    return (
                        <motion.div
                            key={quote.id}
                            className="absolute inset-x-0 top-0"
                            style={
                                isTop && phase === 'idle'
                                    ? { x: dragX, rotate: dragRotate, zIndex, cursor: 'grab' }
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
                            drag={isTop && phase === 'idle' ? 'x' : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.6}
                            onDragEnd={isTop ? handleDragEnd : undefined}
                            whileDrag={isTop ? { scale: 1.02, cursor: 'grabbing' } : undefined}
                        >
                            {/* Card Content */}
                            <div
                                className="w-full h-[280px] bg-white border border-neutral-200 flex flex-col overflow-hidden"
                                style={{
                                    boxShadow: isTop && phase === 'idle'
                                        ? '0 8px 30px -5px rgba(0,0,0,0.12)'
                                        : '0 2px 10px rgba(0,0,0,0.05)',
                                }}
                            >
                                {/* Quote Text */}
                                <div className="flex-1 flex items-center px-10 md:px-14 py-8 overflow-hidden" onClick={isTop ? handleMarkClick : undefined}>
                                    {quote.highlightedPhrases && quote.highlightedPhrases.length > 0 ? (
                                        <p
                                            className="text-xl md:text-[24px] md:leading-[1.6] text-neutral-900 tracking-tight line-clamp-5"
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                            dangerouslySetInnerHTML={{ __html: highlightQuoteText(quote.text, quote.highlightedPhrases) }}
                                        />
                                    ) : (
                                        <p
                                            className="text-xl md:text-[24px] md:leading-[1.6] text-neutral-900 tracking-tight line-clamp-5"
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                        >
                                            {quote.text}
                                        </p>
                                    )}
                                </div>

                                {/* Bottom bar */}
                                <div className="flex items-center justify-between px-10 md:px-14 py-4 border-t border-neutral-100">
                                    <div className="flex flex-col min-w-0 flex-1 mr-4">
                                        <span className="text-xs font-medium text-neutral-900 truncate">
                                            {quote.author || 'Unknown'}
                                        </span>
                                        <span className="text-[11px] text-neutral-400 truncate">
                                            {quote.postTitle || 'Untitled'}
                                        </span>
                                    </div>
                                    {isTop && phase === 'idle' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); goToArticle(); }}
                                            className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400 hover:text-neutral-900 transition-colors whitespace-nowrap flex-shrink-0"
                                        >
                                            Read Source →
                                        </button>
                                    )}
                                </div>
                            </div>
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
