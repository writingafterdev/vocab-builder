'use client';

import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { useVocabHighlighter } from './useVocabHighlighter';

interface ImmersedReaderProps {
    title: string;
    subtitle?: string;
    content: string;
    highlightedPhrases?: string[];
    onPhraseClick: (phrase: string, context: string, rect: DOMRect) => void;
    onProgressChange?: (progress: number) => void;
}

/**
 * Highlight vocab phrases in HTML content by wrapping them in <mark> tags.
 * Case-insensitive, avoids highlighting inside existing tags.
 */
function highlightPhrases(html: string, phrases: string[]): string {
    if (!phrases || phrases.length === 0) return html;

    let result = html;
    // Sort by length descending so longer phrases are matched first
    const sorted = [...phrases].sort((a, b) => b.length - a.length);

    for (const phrase of sorted) {
        // Escape regex special chars
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match phrase not inside HTML tags
        const regex = new RegExp(
            `(?<![<\\w])\\b(${escaped})\\b(?![^<]*>)`,
            'gi'
        );
        result = result.replace(regex, '<mark class="vocab-highlight" data-phrase="$1">$1</mark>');
    }

    return result;
}

export const ImmersedReader = memo(function ImmersedReader({
    title,
    subtitle,
    content,
    highlightedPhrases = [],
    onPhraseClick,
    onProgressChange,
}: ImmersedReaderProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const articleRef = useRef<HTMLDivElement>(null);

    // Reading progress tracking
    const handleScroll = useCallback(() => {
        if (!contentRef.current || !onProgressChange) return;
        const el = contentRef.current;
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight - el.clientHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        onProgressChange(Math.min(100, progress));
    }, [onProgressChange]);

    // Handle clicks on highlighted phrases
    const handleContentClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const target = e.target as HTMLElement;

            if (target.tagName === 'MARK' && target.classList.contains('vocab-highlight')) {
                e.stopPropagation();
                const phrase = target.getAttribute('data-phrase') || target.textContent || '';
                const parent = target.parentElement;
                const context = parent?.textContent?.slice(0, 300) || '';
                const rect = target.getBoundingClientRect();
                onPhraseClick(phrase, context, rect);
            }
        },
        [onPhraseClick]
    );

    // Process content with highlights
    const processedContent = useMemo(
        () => highlightPhrases(sanitizeRichHtml(content), highlightedPhrases),
        [content, highlightedPhrases]
    );

    // Apply rough-notation highlight annotations after content renders
    useVocabHighlighter(articleRef, [processedContent]);

    return (
        <div
            ref={contentRef}
            onScroll={handleScroll}
            className="min-h-screen overflow-y-auto bg-white scroll-smooth"
        >
            <div className="max-w-[900px] mx-auto py-12 md:py-20 px-4 md:px-6 pb-32">
                {/* Floating Article Card */}
                <article className="bg-white shadow-[0_4px_50px_rgba(0,0,0,0.12)] min-h-[80vh] px-10 md:px-20 py-14 md:py-20">
                    {/* Header */}
                    <header className="text-center mb-10">
                        <h1
                            className="text-3xl md:text-[44px] md:leading-[1.15] font-normal text-neutral-900 tracking-tight mb-4"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                        >
                            {title}
                        </h1>

                        {subtitle && (
                            <p
                                className="text-sm md:text-base text-neutral-500 italic max-w-[500px] mx-auto"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            >
                                {subtitle}
                            </p>
                        )}
                    </header>

                    {/* Divider */}
                    <div className="w-full border-t border-neutral-200 mb-10" />

                    {/* Body Content */}
                    <div
                        ref={articleRef}
                        className="prose prose-neutral max-w-none leading-[1.9] text-[17px] text-neutral-800 prose-headings:font-sans prose-headings:font-bold prose-p:mb-6"
                        style={{ fontFamily: 'Georgia, serif' }}
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: processedContent }}
                    />
                </article>
            </div>

            {/* Vocab highlight styles — rough-notation handles the visual, this just adds cursor */}
            <style jsx global>{`
                .vocab-highlight {
                    background: transparent;
                    color: inherit;
                    cursor: pointer;
                    padding: 0 2px;
                    margin: 0 -2px;
                }
                .vocab-highlight:hover {
                    opacity: 0.8;
                }
            `}</style>
        </div>
    );
});
