'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';

interface SelectionLookupState {
    phrase: string;
    context: string;
    pillPos: { top: number; left: number };
}

/**
 * useSelectionLookup — Monitors native text selection within a container ref.
 * When user selects text, a floating "Lookup" pill appears above the selection.
 * Clicking the pill calls onLookup(phrase, context).
 *
 * Returns a portal-rendered React element to include in your component tree.
 */
export function useSelectionLookup(
    containerRef: React.RefObject<HTMLElement | null>,
    onLookup: (phrase: string, context: string) => void,
    enabled: boolean = true,
) {
    const [selection, setSelection] = useState<SelectionLookupState | null>(null);
    const isHandlingLookup = useRef(false);

    // Listen for selection changes
    useEffect(() => {
        if (!enabled) return;

        const handleSelectionChange = () => {
            // Skip if we just handled a lookup click
            if (isHandlingLookup.current) return;

            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) {
                setSelection(null);
                return;
            }

            const selectedText = sel.toString().trim();
            if (!selectedText || selectedText.length < 2 || selectedText.length > 100) {
                setSelection(null);
                return;
            }

            // Check selection is inside our container
            const range = sel.getRangeAt(0);
            if (!containerRef.current?.contains(range.commonAncestorContainer)) {
                setSelection(null);
                return;
            }

            // Get surrounding context (the paragraph text)
            let contextNode = range.commonAncestorContainer;
            while (contextNode && contextNode.nodeType !== Node.ELEMENT_NODE) {
                contextNode = contextNode.parentNode!;
            }
            // Walk up to find a meaningful block (p, div, blockquote)
            const blockEl = (contextNode as HTMLElement)?.closest?.('p, div, blockquote, li');
            const context = blockEl?.textContent?.slice(0, 400) || selectedText;

            // Position the pill above the selection
            const rect = range.getBoundingClientRect();
            setSelection({
                phrase: selectedText,
                context,
                pillPos: {
                    top: rect.top - 44,
                    left: rect.left + rect.width / 2,
                },
            });
        };

        document.addEventListener('selectionchange', handleSelectionChange);

        // Also dismiss on click outside
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-selection-lookup-pill]')) return;
            // Small delay to let the new selection form first
            setTimeout(() => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed) {
                    setSelection(null);
                }
            }, 10);
        };

        document.addEventListener('mousedown', handleMouseDown);

        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, [containerRef, enabled]);

    // Handle lookup click
    const handleLookup = useCallback(() => {
        if (!selection) return;
        isHandlingLookup.current = true;
        onLookup(selection.phrase, selection.context);

        // Clear selection
        window.getSelection()?.removeAllRanges();
        setSelection(null);

        // Reset flag after a tick
        setTimeout(() => {
            isHandlingLookup.current = false;
        }, 100);
    }, [selection, onLookup]);

    // The portal element to render
    const LookupPill = typeof document !== 'undefined' && selection ? createPortal(
        <AnimatePresence>
            <motion.button
                data-selection-lookup-pill
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleLookup();
                }}
                onMouseDown={(e) => {
                    // Prevent this click from clearing selection
                    e.preventDefault();
                }}
                className="
                    inline-flex items-center gap-1.5 font-sans
                    px-3 py-1.5
                    bg-neutral-900 text-white
                    text-[11px] font-bold uppercase tracking-wider
                    shadow-[0_4px_12px_rgba(0,0,0,0.2)]
                    hover:bg-neutral-800 active:scale-95
                    transition-all duration-150
                    whitespace-nowrap
                    pointer-events-auto
                    select-none
                "
                style={{
                    position: 'fixed',
                    top: selection.pillPos.top,
                    left: selection.pillPos.left,
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                }}
            >
                <Search className="w-3 h-3" />
                Lookup
            </motion.button>
        </AnimatePresence>,
        document.body
    ) : null;

    return { LookupPill, hasSelection: !!selection };
}
