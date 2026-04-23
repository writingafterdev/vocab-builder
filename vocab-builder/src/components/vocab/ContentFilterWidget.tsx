'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, ChevronDown, X, Loader2, Check } from 'lucide-react';
import { SOURCE_CATALOG } from '@/lib/source-catalog';
import { cn } from '@/lib/utils';
import type { Deck } from '@/lib/db/types';

// ── Topic list (shared with QuoteSwiper / FeedFilter) ──
const TOPICS = [
    { id: 'technology', label: 'Technology', emoji: '💻' },
    { id: 'science',    label: 'Science',    emoji: '🔬' },
    { id: 'business',   label: 'Business',   emoji: '💼' },
    { id: 'psychology', label: 'Psychology', emoji: '🧠' },
    { id: 'culture',    label: 'Culture',    emoji: '🏛' },
    { id: 'philosophy', label: 'Philosophy', emoji: '💭' },
    { id: 'world',      label: 'World',      emoji: '🌍' },
    { id: 'health',     label: 'Health',     emoji: '❤️‍🩹' },
    { id: 'politics',   label: 'Politics',   emoji: '⚖️' },
    { id: 'art',        label: 'Art',        emoji: '🎨' },
] as const;

export interface ContentFilterState {
    activeTab?: 'quotes' | 'articles' | 'decks';
    // Quotes
    quoteTopics: string[];
    // Articles
    articleSource: string | null;
    articleSection: string | null;
    articleTopic: string | null;
}

interface DeckWithSub extends Deck {
    isSubscribed: boolean;
}

interface ContentFilterWidgetProps {
    filters: ContentFilterState;
    userId?: string;
    onActiveTabChange?: (tab: 'quotes' | 'articles' | 'decks') => void;
    onQuoteTopicsChange: (topics: string[]) => void;
    onArticleSourceChange: (sourceId: string | null) => void;
    onArticleSectionChange: (sectionId: string | null) => void;
    onArticleTopicChange: (topic: string | null) => void;
    activeDeckId?: string | null;
    onDeckSelect?: (deckId: string) => void;
}

// ── Pill styling helpers ──
const chipClass = (active: boolean) =>
    cn(
        'flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-all duration-200 cursor-pointer select-none',
        active
            ? 'bg-neutral-900 text-white'
            : 'bg-transparent border border-neutral-200 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900',
    );

const refineChipClass = (active: boolean) =>
    cn(
        'flex-shrink-0 px-2 py-1 text-[10px] font-semibold transition-all duration-150 cursor-pointer select-none',
        active
            ? 'bg-neutral-100 text-neutral-900'
            : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50',
    );

export function ContentFilterWidget({
    filters,
    userId,
    onActiveTabChange,
    onQuoteTopicsChange,
    onArticleSourceChange,
    onArticleSectionChange,
    onArticleTopicChange,
    activeDeckId,
    onDeckSelect,
}: ContentFilterWidgetProps) {
    const [open, setOpen] = useState(false);

    // ── Deck subscription state ──
    const [decks, setDecks] = useState<DeckWithSub[]>([]);
    const [decksLoading, setDecksLoading] = useState(false);
    const [togglingDeck, setTogglingDeck] = useState<string | null>(null);

    const fetchDecks = useCallback(async () => {
        if (!userId) return;
        setDecksLoading(true);
        try {
            const res = await fetch(`/api/user/deck-subscriptions?userId=${userId}`);
            if (res.ok) {
                const data = await res.json();
                setDecks(data.decks || []);
            }
        } catch (e) {
            console.error('Failed to fetch decks:', e);
        } finally {
            setDecksLoading(false);
        }
    }, [userId]);

    // Fetch decks when panel opens on decks tab or when switching to decks tab
    useEffect(() => {
        if (open && filters.activeTab === 'decks' && decks.length === 0) {
            fetchDecks();
        }
    }, [open, filters.activeTab, fetchDecks, decks.length]);

    const toggleSubscription = async (deckId: string, currentlySubscribed: boolean) => {
        if (!userId) return;
        setTogglingDeck(deckId);
        try {
            await fetch('/api/user/deck-subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    deckId,
                    action: currentlySubscribed ? 'unsubscribe' : 'subscribe',
                }),
            });
            setDecks(prev => prev.map(d => d.id === deckId ? { ...d, isSubscribed: !currentlySubscribed } : d));
        } catch (e) {
            console.error('Failed to toggle subscription:', e);
        } finally {
            setTogglingDeck(null);
        }
    };

    const selectedSourceDef = filters.articleSource
        ? SOURCE_CATALOG.find(s => s.id === filters.articleSource)
        : null;

    // Count active filters for badge
    const activeCount =
        filters.quoteTopics.length +
        (filters.articleSource ? 1 : 0) +
        (filters.articleSection ? 1 : 0) +
        (filters.articleTopic ? 1 : 0);

    const clearAll = () => {
        onQuoteTopicsChange([]);
        onArticleSourceChange(null);
        onArticleSectionChange(null);
        onArticleTopicChange(null);
    };

    return (
        <>
            {/* ── Toggle Button (left side, mirroring the BookOpen on the right) ── */}
            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setOpen(!open)}
                className={cn(
                    'fixed z-30 flex items-center gap-1.5 font-sans px-3 py-2 text-[11px] font-bold uppercase tracking-wider shadow-sm transition-all duration-200',
                    'bottom-[100px] md:bottom-24 left-4 md:left-6',
                    open
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]',
                )}
            >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {activeCount > 0 && (
                    <span className="min-w-[16px] h-4 flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full px-1">
                        {activeCount}
                    </span>
                )}
            </motion.button>

            {/* ── Filter Panel ── */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-[140px] md:bottom-36 left-4 md:left-6 z-30 w-[calc(100vw-2rem)] md:w-[320px] flex flex-col max-h-[65vh] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">Filters</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {activeCount > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                                    >
                                        Clear all
                                    </button>
                                )}
                                <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-[var(--border)]">
                            {(['quotes', 'articles', 'decks'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        onActiveTabChange?.(tab);
                                        if (tab === 'decks' && decks.length === 0) fetchDecks();
                                    }}
                                    className={cn(
                                        "flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-all duration-200",
                                        filters.activeTab === tab
                                            ? "text-neutral-900 border-b-2 border-neutral-900 bg-neutral-50"
                                            : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50/50 border-b-2 border-transparent"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Scrollable body */}
                        <div className="overflow-y-auto flex-1 p-4">
                            <AnimatePresence mode="wait">
                                {filters.activeTab === 'quotes' ? (
                                    <motion.div
                                        key="quotes-filters"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 mb-3 block">
                                                Quote Topics
                                                {filters.quoteTopics.length > 0 && <span className="ml-1.5 text-neutral-900">({filters.quoteTopics.length})</span>}
                                            </span>
                                            <div className="flex flex-wrap gap-2">
                                                {TOPICS.map(topic => {
                                                    const isActive = filters.quoteTopics.includes(topic.id);
                                                    return (
                                                        <button
                                                            key={topic.id}
                                                            onClick={() => {
                                                                const next = isActive
                                                                    ? filters.quoteTopics.filter(t => t !== topic.id)
                                                                    : [...filters.quoteTopics, topic.id];
                                                                onQuoteTopicsChange(next);
                                                            }}
                                                            className={chipClass(isActive)}
                                                        >
                                                            <span className="text-sm">{topic.emoji}</span>
                                                            <span>{topic.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : filters.activeTab === 'articles' ? (
                                    <motion.div
                                        key="articles-filters"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-6"
                                    >
                                        {/* Layer 1: Sources */}
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 mb-3 block">Source</span>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => { onArticleSourceChange(null); onArticleSectionChange(null); }}
                                                    className={chipClass(!filters.articleSource)}
                                                >
                                                    <span className="text-sm">🌐</span>
                                                    <span>All</span>
                                                </button>
                                                {SOURCE_CATALOG.map(source => {
                                                    const isActive = filters.articleSource === source.id;
                                                    return (
                                                        <button
                                                            key={source.id}
                                                            onClick={() => { onArticleSourceChange(source.id); onArticleSectionChange(null); }}
                                                            className={chipClass(isActive)}
                                                            style={isActive && source.themeParams ? {
                                                                backgroundColor: source.themeParams.accentColor,
                                                                borderColor: source.themeParams.accentColor,
                                                                color: '#fff',
                                                            } : {}}
                                                        >
                                                            <span className="text-sm">{source.icon}</span>
                                                            <span>{source.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Layer 2: Sections (only if source has them) */}
                                        {selectedSourceDef?.hasSections && selectedSourceDef.sections && (
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 mb-2 block">Section</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <button
                                                        onClick={() => onArticleSectionChange(null)}
                                                        className={refineChipClass(!filters.articleSection)}
                                                    >
                                                        All
                                                    </button>
                                                    {selectedSourceDef.sections.map(sec => (
                                                        <button
                                                            key={sec.id}
                                                            onClick={() => onArticleSectionChange(sec.id)}
                                                            className={refineChipClass(filters.articleSection === sec.id)}
                                                        >
                                                            {sec.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Layer 3: Topics */}
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 mb-2 block">Article Topic</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                <button
                                                    onClick={() => onArticleTopicChange(null)}
                                                    className={refineChipClass(!filters.articleTopic)}
                                                >
                                                    <span className="text-sm">✨</span> All
                                                </button>
                                                {TOPICS.map(topic => (
                                                    <button
                                                        key={topic.id}
                                                        onClick={() => onArticleTopicChange(topic.id)}
                                                        className={refineChipClass(filters.articleTopic === topic.id)}
                                                    >
                                                        <span className="text-sm">{topic.emoji}</span> {topic.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    /* ── Decks Tab ── */
                                    <motion.div
                                        key="decks-filters"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-3"
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 block">
                                            Vocabulary Decks
                                        </span>

                                        {decksLoading ? (
                                            <div className="flex items-center justify-center py-6 text-neutral-400">
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                <span className="text-xs">Loading decks...</span>
                                            </div>
                                        ) : decks.length === 0 ? (
                                            <p className="text-xs text-neutral-400 py-4 text-center">No decks available yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {decks.map(deck => (
                                                    <div
                                                        key={deck.id}
                                                        onClick={() => onDeckSelect?.(deck.id)}
                                                        className={cn(
                                                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 cursor-pointer',
                                                            deck.id === activeDeckId
                                                                ? 'bg-neutral-900 text-white'
                                                                : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                                                        )}
                                                    >
                                                        <span className="text-lg flex-shrink-0">{deck.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[11px] font-bold uppercase tracking-wider truncate">{deck.name}</div>
                                                            {deck.description && (
                                                                <div className={cn(
                                                                    'text-[10px] truncate mt-0.5',
                                                                    deck.id === activeDeckId ? 'text-neutral-400' : 'text-neutral-400'
                                                                )}>
                                                                    {deck.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleSubscription(deck.id, deck.isSubscribed);
                                                            }}
                                                            disabled={togglingDeck === deck.id}
                                                            className="flex-shrink-0 cursor-pointer p-1"
                                                        >
                                                            {togglingDeck === deck.id ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : deck.isSubscribed ? (
                                                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                                                    <Check className="w-3 h-3 text-white" />
                                                                </div>
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                                                            )}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-[10px] text-neutral-400 pt-2 leading-relaxed">
                                            Subscribed decks feed you targeted vocabulary in your daily quotes & facts.
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
