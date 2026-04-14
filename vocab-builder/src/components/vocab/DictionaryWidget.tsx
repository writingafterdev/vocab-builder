'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import { VocabPopupCard } from '@/components/article/VocabPopupCard';
import { useDictionaryStore } from '@/stores/dictionary-store';
import { toast } from 'sonner';

/**
 * DictionaryWidget — Mounted once in the global app layout.
 *
 * Contains:
 * 1. The VocabPopupCard (driven by Zustand store)
 * 2. The review toggle button (small pill in bottom-right)
 * 3. The stacked review cards overlay
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
    const handleReviewCardClick = (card: typeof reviewCards[number]) => {
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
                {reviewOpen && reviewCards.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-[140px] md:bottom-36 right-4 left-4 md:left-auto md:right-6 z-30 w-auto md:w-[300px] flex flex-col gap-2 max-h-[60vh] overflow-y-auto"
                    >
                        {reviewCards.map((card, idx) => (
                            <motion.div
                                key={card.phrase}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
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
                        ))}
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
