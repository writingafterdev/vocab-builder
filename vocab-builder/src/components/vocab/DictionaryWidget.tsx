'use client';

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import { VocabPopupCard } from '@/components/article/VocabPopupCard';
import { useDictionaryStore, DictionaryPopupState } from '@/stores/dictionary-store';
import { toast } from 'sonner';

type ReviewMode = 'session' | 'all';

/** Safely parse a JSON string, returning the original value if it fails */
function tryParse(val: string): any {
    try { return JSON.parse(val); } catch { return val; }
}

/**
 * DictionaryWidget — Mounted once in the global app layout.
 *
 * Contains:
 * 1. The VocabPopupCard (driven by Zustand store)
 * 2. The review toggle button (small pill in bottom-right)
 * 3. The stacked review cards overlay (with session/all toggle)
 */
export function DictionaryWidget() {
    const {
        popup,
        bounceKey,
        isSaved,
        dismissPopup,
        savePhrase,
        markSaved,
        reviewOpen,
        reviewCards,
        toggleReview,
        userId,
        userEmail,
        openPopup,
    } = useDictionaryStore();

    const [reviewMode, setReviewMode] = useState<ReviewMode>('session');
    const [allSavedPhrases, setAllSavedPhrases] = useState<DictionaryPopupState[]>([]);
    const [loadingAll, setLoadingAll] = useState(false);
    const [hasFetchedAll, setHasFetchedAll] = useState(false);

    // Fetch all previously looked-up phrases when switching to "all" mode
    const fetchAllPhrases = useCallback(async () => {
        if (!userId || hasFetchedAll) return;
        setLoadingAll(true);
        try {
            const res = await fetch(`/api/user/lookup-history?userId=${userId}&limit=200`, {
                headers: { 'x-user-id': userId },
            });
            if (res.ok) {
                const data = await res.json();
                const phrases = data.phrases || [];
                // Dedupe by phrase (keep most recent)
                const seen = new Set<string>();
                const deduped: DictionaryPopupState[] = [];
                for (const p of phrases) {
                    const key = p.phrase.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        deduped.push({
                            phrase: p.phrase,
                            meaning: p.meaning || '',
                            register: p.register ? tryParse(p.register) : undefined,
                            nuance: p.nuance ? tryParse(p.nuance) : undefined,
                            topic: p.topic ? tryParse(p.topic) : undefined,
                            subtopic: p.subtopic ? tryParse(p.subtopic) : undefined,
                        });
                    }
                }
                setAllSavedPhrases(deduped);
                setHasFetchedAll(true);
            }
        } catch (err) {
            console.error('Failed to fetch lookup history:', err);
        } finally {
            setLoadingAll(false);
        }
    }, [userId, hasFetchedAll]);

    // Trigger fetch when switching to "all" mode
    useEffect(() => {
        if (reviewMode === 'all' && !hasFetchedAll) {
            fetchAllPhrases();
        }
    }, [reviewMode, hasFetchedAll, fetchAllPhrases]);

    // Invalidate cache when a new phrase is saved
    useEffect(() => {
        if (isSaved && hasFetchedAll) {
            setHasFetchedAll(false);
        }
    }, [isSaved, hasFetchedAll]);

    const displayCards = reviewMode === 'session' ? reviewCards : allSavedPhrases;

    // Handle save with toast feedback
    const handleSave = async () => {
        await savePhrase();
        const phrase = useDictionaryStore.getState().popup?.phrase;
        if (useDictionaryStore.getState().isSaved && phrase) {
            toast.success(`Saved "${phrase}"!`, {
                action: {
                    label: 'View in Bank',
                    onClick: () => window.location.href = '/vocab',
                },
            });
        }
    };

    // Handle clicking a review card → open it in the main popup
    const handleReviewCardClick = (card: DictionaryPopupState) => {
        if (!userId || !userEmail) return;
        openPopup(card.phrase, card.context || '', userId, userEmail);
        useDictionaryStore.setState({ reviewOpen: false });
    };

    return (
        <>
            {/* ── Review Toggle Button (always visible) ── */}
            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={toggleReview}
                className={`
                    fixed z-30 flex items-center gap-1.5 font-sans
                    px-3 py-2
                    text-[11px] font-bold uppercase tracking-wider
                    shadow-sm transition-all duration-200
                    ${reviewOpen
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] bottom-[100px] md:bottom-24 right-4 md:right-6'
                        : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] bottom-[100px] md:bottom-24 right-4 md:right-6 hover:text-[var(--foreground)] hover:border-[var(--foreground)]'
                    }
                `}
            >
                <BookOpen className="w-3.5 h-3.5" />
                {reviewCards.length > 0 && reviewCards.length}
            </motion.button>

            {/* ── Stacked Review Cards ── */}
            <AnimatePresence>
                {reviewOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-[140px] md:bottom-36 right-4 left-4 md:left-auto md:right-6 z-30 w-auto md:w-[300px] flex flex-col max-h-[60vh]"
                    >
                        {/* Mode Toggle */}
                        <div className="flex bg-[var(--card)] border border-[var(--border)] mb-2 p-0.5">
                            <button
                                onClick={() => setReviewMode('session')}
                                className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-all duration-200 ${
                                    reviewMode === 'session'
                                        ? 'bg-neutral-900 text-white'
                                        : 'text-neutral-500 hover:text-neutral-900'
                                }`}
                            >
                                This Session ({reviewCards.length})
                            </button>
                            <button
                                onClick={() => setReviewMode('all')}
                                className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 px-2 transition-all duration-200 ${
                                    reviewMode === 'all'
                                        ? 'bg-neutral-900 text-white'
                                        : 'text-neutral-500 hover:text-neutral-900'
                                }`}
                            >
                                All Lookups {hasFetchedAll ? `(${allSavedPhrases.length})` : ''}
                            </button>
                        </div>

                        {/* Cards List */}
                        <div className="flex flex-col gap-2 overflow-y-auto">
                            {loadingAll && reviewMode === 'all' ? (
                                <div className="flex items-center justify-center py-6">
                                    <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
                                </div>
                            ) : displayCards.length === 0 ? (
                                <div className="bg-[var(--card)] border border-[var(--border)] px-4 py-6 text-center">
                                    <p className="text-xs text-neutral-400">
                                        {reviewMode === 'session'
                                            ? 'Tap any word to look it up'
                                            : 'No lookups yet'}
                                    </p>
                                </div>
                            ) : (
                                displayCards.map((card, idx) => (
                                    <motion.div
                                        key={`${reviewMode}-${card.phrase}`}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        onClick={() => handleReviewCardClick(card)}
                                        className="
                                            bg-[var(--card)] border border-[var(--border)] shadow-sm
                                            px-4 py-3 cursor-pointer font-sans
                                            hover:border-[var(--foreground)] hover:shadow-md
                                            transition-all duration-200
                                            active:scale-[0.98]
                                        "
                                    >
                                        <p className="text-sm font-medium text-neutral-900 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                            {card.phrase}
                                        </p>
                                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                                            {card.meaning}
                                        </p>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Main VocabPopupCard ── */}
            <AnimatePresence mode="wait">
                {popup && (
                    <VocabPopupCard
                        key={popup.phrase}
                        phrase={popup.phrase}
                        meaning={popup.meaning}
                        register={popup.register}
                        nuance={popup.nuance}
                        context={popup.context}
                        contextTranslation={popup.contextTranslation}
                        pronunciation={popup.pronunciation}
                        topic={popup.topic}
                        subtopic={popup.subtopic}
                        isHighFrequency={popup.isHighFrequency}
                        bounceKey={bounceKey}
                        onSave={handleSave}
                        onDismiss={dismissPopup}
                        isSaved={isSaved}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
