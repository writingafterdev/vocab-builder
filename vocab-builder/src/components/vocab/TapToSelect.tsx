'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';

interface TapToSelectProps {
    /** The raw text string to render as tappable words */
    text: string;
    /** CSS class for the text container */
    className?: string;
    /** Inline style passthrough (e.g., fontFamily) */
    style?: React.CSSProperties;
    /** Called when user taps "Lookup" with the built phrase + full sentence context */
    onLookup: (phrase: string, context: string) => void;
    /** Disable interaction */
    disabled?: boolean;
    /** Highlighted phrases to show as <mark> hints (when review mode is on) */
    highlightedPhrases?: string[];
    /** Called when a highlighted phrase <mark> is clicked */
    onHighlightClick?: (phrase: string, context: string) => void;
}

/**
 * TapToSelect — Makes every word in a text block individually tappable.
 *
 * Users tap words one at a time to build up a contiguous phrase selection.
 * Once satisfied, they hit the floating "Lookup" pill to trigger the dictionary.
 */
export function TapToSelect({
    text,
    className,
    style,
    onLookup,
    disabled = false,
    highlightedPhrases = [],
    onHighlightClick,
}: TapToSelectProps) {
    // Selected word indices (contiguous range)
    const [selStart, setSelStart] = useState<number | null>(null);
    const [selEnd, setSelEnd] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Track the position of the last selected word for the pill
    const [pillPos, setPillPos] = useState<{ top: number; left: number } | null>(null);
    const lastSelectedWordRef = useRef<HTMLSpanElement | null>(null);

    // Split text into words, preserving whitespace positions
    const words = useMemo(() => {
        return text.split(/(\s+)/).filter(Boolean);
    }, [text]);

    // Get actual word tokens (non-whitespace) with their indices
    const wordTokens = useMemo(() => {
        const tokens: Array<{ word: string; index: number }> = [];
        words.forEach((w, i) => {
            if (w.trim()) tokens.push({ word: w, index: i });
        });
        return tokens;
    }, [words]);

    // Build a lookup of highlighted phrases for efficient matching
    const highlightMap = useMemo(() => {
        if (highlightedPhrases.length === 0) return null;

        const map = new Map<number, { length: number; phrase: string }>();
        const wordsLower = wordTokens.map(t => t.word.toLowerCase().replace(/[.,!?;:'"()]/g, ''));

        for (const phrase of highlightedPhrases) {
            const phraseWords = phrase.toLowerCase().split(/\s+/);
            for (let i = 0; i <= wordsLower.length - phraseWords.length; i++) {
                let match = true;
                for (let j = 0; j < phraseWords.length; j++) {
                    if (wordsLower[i + j] !== phraseWords[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const existing = map.get(i);
                    if (!existing || phraseWords.length > existing.length) {
                        map.set(i, { length: phraseWords.length, phrase });
                    }
                }
            }
        }

        return map;
    }, [highlightedPhrases, wordTokens]);

    // Get the word-token-index for a given words[] array index
    const getTokenIndex = useCallback((wordsIndex: number): number => {
        return wordTokens.findIndex(t => t.index === wordsIndex);
    }, [wordTokens]);

    // Update pill position when selection changes
    useEffect(() => {
        if (selEnd === null || !lastSelectedWordRef.current) {
            setPillPos(null);
            return;
        }

        const updatePos = () => {
            const el = lastSelectedWordRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setPillPos({
                top: rect.top - 44, // 44px above the word
                left: rect.left + rect.width / 2,
            });
        };

        updatePos();

        // Update on scroll/resize
        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        return () => {
            window.removeEventListener('scroll', updatePos, true);
            window.removeEventListener('resize', updatePos);
        };
    }, [selEnd, selStart]);

    // Handle tapping a word
    const handleWordTap = useCallback((tokenIdx: number) => {
        if (disabled) return;

        if (selStart === null) {
            setSelStart(tokenIdx);
            setSelEnd(tokenIdx);
            return;
        }

        if (tokenIdx === selStart && tokenIdx === selEnd) {
            setSelStart(null);
            setSelEnd(null);
            return;
        }

        if (tokenIdx < selStart!) {
            setSelStart(tokenIdx);
        } else if (tokenIdx > selEnd!) {
            setSelEnd(tokenIdx);
        } else if (tokenIdx === selStart) {
            setSelStart(selStart! + 1);
        } else if (tokenIdx === selEnd) {
            setSelEnd(selEnd! - 1);
        }
    }, [selStart, selEnd, disabled]);

    // Build the selected phrase string
    const selectedPhrase = useMemo(() => {
        if (selStart === null || selEnd === null) return '';
        return wordTokens
            .slice(selStart, selEnd + 1)
            .map(t => t.word)
            .join(' ');
    }, [selStart, selEnd, wordTokens]);

    // Handle the "Lookup" button click
    const handleLookup = useCallback(() => {
        if (!selectedPhrase) return;
        onLookup(selectedPhrase, text);
        setSelStart(null);
        setSelEnd(null);
    }, [selectedPhrase, text, onLookup]);

    // Handle clicking outside to deselect
    const handleContainerClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.dataset.wordIdx && !target.closest('[data-lookup-pill]')) {
            setSelStart(null);
            setSelEnd(null);
        }
    }, []);

    const pillAnchorIdx = selEnd !== null ? selEnd : null;
    const hasSelection = selStart !== null && selEnd !== null;

    return (
        <>
            <div
                ref={containerRef}
                className={className}
                style={style}
                onClick={handleContainerClick}
            >
                {words.map((segment, i) => {
                    if (!segment.trim()) {
                        return <span key={i}>{segment}</span>;
                    }

                    const tokenIdx = getTokenIndex(i);
                    if (tokenIdx === -1) return <span key={i}>{segment}</span>;

                    const isSelected =
                        selStart !== null &&
                        selEnd !== null &&
                        tokenIdx >= selStart &&
                        tokenIdx <= selEnd;

                    let isHighlighted = false;
                    let highlightPhrase = '';
                    if (highlightMap && !isSelected) {
                        for (const [startIdx, { length, phrase }] of highlightMap.entries()) {
                            if (tokenIdx >= startIdx && tokenIdx < startIdx + length) {
                                isHighlighted = true;
                                highlightPhrase = phrase;
                                break;
                            }
                        }
                    }

                    // If this is the last selected word, attach the ref for pill positioning
                    const isLastSelected = isSelected && tokenIdx === pillAnchorIdx;

                    return (
                        <span
                            key={i}
                            ref={isLastSelected ? lastSelectedWordRef : undefined}
                            data-word-idx={tokenIdx}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isHighlighted && !isSelected && onHighlightClick) {
                                    onHighlightClick(highlightPhrase, text);
                                    return;
                                }
                                handleWordTap(tokenIdx);
                            }}
                            className={`
                                transition-all duration-150
                                ${disabled ? '' : 'cursor-pointer'}
                                ${isSelected
                                    ? 'text-[var(--foreground)] underline decoration-2 underline-offset-[3px] decoration-[var(--foreground)]'
                                    : isHighlighted
                                        ? `text-inherit border-b border-[var(--border)] ${disabled ? '' : 'cursor-pointer'}`
                                        : disabled ? '' : 'hover:text-[var(--muted-foreground)]'
                                }
                            `}
                            style={{
                                padding: isSelected ? '1px 2px' : '0 1px',
                                margin: isSelected ? '0 -1px' : undefined,
                            }}
                        >
                            {segment}
                        </span>
                    );
                })}
            </div>

            {/* Lookup pill — rendered via portal to avoid overflow:hidden clipping */}
            {typeof document !== 'undefined' && hasSelection && pillPos &&
                createPortal(
                    <AnimatePresence>
                        <motion.button
                            data-lookup-pill
                            initial={{ opacity: 0, y: 8, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.9 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleLookup();
                            }}
                            className="
                                inline-flex items-center gap-1.5 font-sans
                                px-3 py-1.5
                                bg-[var(--primary)] text-[var(--primary-foreground)]
                                text-[11px] font-bold uppercase tracking-wider
                                shadow-[0_4px_12px_rgba(0,0,0,0.12)]
                                hover:opacity-90 active:scale-95
                                transition-all duration-150
                                whitespace-nowrap
                                pointer-events-auto
                            "
                            style={{
                                position: 'fixed',
                                top: pillPos.top,
                                left: pillPos.left,
                                transform: 'translateX(-50%)',
                                zIndex: 9999,
                            }}
                        >
                            <Search className="w-3 h-3" />
                            Lookup
                        </motion.button>
                    </AnimatePresence>,
                    document.body
                )
            }
        </>
    );
}
