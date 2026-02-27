'use client';

import { useState, useCallback, useRef } from 'react';
import { GlobalPhraseData } from '@/lib/db/types';

interface UseGlobalDictionaryReturn {
    lookupPhrase: (phrase: string, context?: string) => Promise<GlobalPhraseData | null>;
    isLoading: boolean;
    lastLookup: GlobalPhraseData | null;
    wasCached: boolean;
}

/**
 * Hook for looking up phrases in the Global Phrase Dictionary
 * Checks cache first, generates on miss
 */
export function useGlobalDictionary(): UseGlobalDictionaryReturn {
    const [isLoading, setIsLoading] = useState(false);
    const [lastLookup, setLastLookup] = useState<GlobalPhraseData | null>(null);
    const [wasCached, setWasCached] = useState(false);

    const lookupPhrase = useCallback(async (
        phrase: string,
        context?: string
    ): Promise<GlobalPhraseData | null> => {
        if (!phrase || phrase.trim().length === 0) return null;

        setIsLoading(true);

        try {
            const response = await fetch('/api/user/lookup-phrase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phrase: phrase.trim(), context }),
            });

            if (!response.ok) {
                console.error('Dictionary lookup failed:', await response.text());
                return null;
            }

            const data = await response.json();

            if (data.success) {
                setLastLookup(data.data);
                setWasCached(data.cached);
                return data.data as GlobalPhraseData;
            }

            return null;
        } catch (error) {
            console.error('Dictionary lookup error:', error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        lookupPhrase,
        isLoading,
        lastLookup,
        wasCached,
    };
}

/**
 * Get word at click position (handles text selection)
 */
export function getWordAtPosition(
    event: MouseEvent | React.MouseEvent,
    containerElement?: HTMLElement
): { word: string; context: string } | null {
    // Check if there's a text selection first
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
        const word = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const context = container.textContent?.slice(0, 200) || '';
        return { word, context };
    }

    // Otherwise, get word at cursor position
    const target = event.target as Node;
    if (!target || target.nodeType !== Node.TEXT_NODE) {
        // Try to find text node under click
        const element = event.target as HTMLElement;
        const text = element.textContent || '';
        if (!text) return null;

        // Just use the whole element text as context
        // and try to extract word from click position
        return null;
    }

    const textContent = target.textContent || '';

    // Use Range to find word at click position
    const range = document.caretRangeFromPoint(
        (event as MouseEvent).clientX,
        (event as MouseEvent).clientY
    );

    if (!range) return null;

    const offset = range.startOffset;

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(textContent[start - 1])) {
        start--;
    }
    while (end < textContent.length && /\w/.test(textContent[end])) {
        end++;
    }

    const word = textContent.slice(start, end);
    if (!word || word.length < 2) return null;

    // Get surrounding context
    const contextStart = Math.max(0, start - 50);
    const contextEnd = Math.min(textContent.length, end + 150);
    const context = textContent.slice(contextStart, contextEnd);

    return { word, context };
}

/**
 * Hook for hover effect on article text
 */
export function useTextHoverEffect() {
    const lastHoveredElement = useRef<HTMLElement | null>(null);

    const handleMouseMove = useCallback((event: MouseEvent) => {
        // Remove hover from previous element
        if (lastHoveredElement.current) {
            lastHoveredElement.current.classList.remove('word-hover-active');
            lastHoveredElement.current = null;
        }

        // Check if we're over text
        const target = event.target as HTMLElement;
        if (!target) return;

        // Don't add hover to non-text elements
        const tagName = target.tagName.toLowerCase();
        if (['button', 'a', 'input', 'img', 'mark'].includes(tagName)) return;

        // Check if there's text content
        const hasDirectText = target.childNodes.length > 0 &&
            Array.from(target.childNodes).some(node =>
                node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
            );

        if (hasDirectText || target.tagName === 'SPAN' || target.tagName === 'P') {
            target.classList.add('word-hover-active');
            lastHoveredElement.current = target;
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (lastHoveredElement.current) {
            lastHoveredElement.current.classList.remove('word-hover-active');
            lastHoveredElement.current = null;
        }
    }, []);

    return {
        handleMouseMove,
        handleMouseLeave,
    };
}
