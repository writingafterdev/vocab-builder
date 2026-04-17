'use client';

import { useMemo } from 'react';
import { TapToSelect } from '@/components/vocab/TapToSelect';

interface ParsedBlock {
    tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'li' | 'figcaption' | 'other';
    text: string;
    html: string; // original HTML for fallback (images, etc.)
    hasOnlyMedia: boolean; // true if block is just an image/video
}

/**
 * Parse HTML string into an array of text blocks.
 * Falls back to rendering raw HTML for media-only blocks.
 */
function parseHtmlBlocks(html: string): ParsedBlock[] {
    if (typeof document === 'undefined') return [];

    const div = document.createElement('div');
    div.innerHTML = html;

    const blocks: ParsedBlock[] = [];
    const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'LI', 'FIGCAPTION', 'DIV', 'FIGURE']);

    const walk = (parent: Element) => {
        parent.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (text) {
                    blocks.push({ tag: 'p', text, html: text, hasOnlyMedia: false });
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as Element;
            const tagName = el.tagName;

            if (blockTags.has(tagName)) {
                const text = el.textContent?.trim() || '';
                const hasImg = el.querySelector('img, video, iframe, svg');
                const hasOnlyMedia = !text && !!hasImg;

                if (hasOnlyMedia) {
                    blocks.push({
                        tag: 'other',
                        text: '',
                        html: el.outerHTML,
                        hasOnlyMedia: true,
                    });
                } else if (text) {
                    blocks.push({
                        tag: tagName.toLowerCase() as ParsedBlock['tag'],
                        text,
                        html: el.outerHTML,
                        hasOnlyMedia: false,
                    });
                }

                // If it's a UL/OL, walk into children for LI items
                if (tagName === 'UL' || tagName === 'OL') {
                    walk(el);
                }
            } else if (tagName === 'UL' || tagName === 'OL') {
                walk(el);
            } else if (tagName === 'IMG' || tagName === 'VIDEO' || tagName === 'IFRAME') {
                blocks.push({
                    tag: 'other',
                    text: '',
                    html: el.outerHTML,
                    hasOnlyMedia: true,
                });
            } else {
                // Unknown block — walk children
                walk(el);
            }
        });
    };

    walk(div);
    return blocks;
}

/** Map block tag to appropriate text styling */
function getBlockClassName(tag: ParsedBlock['tag']): string {
    switch (tag) {
        case 'h1':
            return 'text-3xl md:text-4xl font-bold mb-6 text-neutral-900';
        case 'h2':
            return 'text-2xl md:text-3xl font-bold mb-5 mt-8 text-neutral-900';
        case 'h3':
            return 'text-xl md:text-2xl font-semibold mb-4 mt-6 text-neutral-900';
        case 'h4':
            return 'text-lg font-semibold mb-3 mt-4 text-neutral-900';
        case 'blockquote':
            return 'text-[17px] leading-[1.9] text-neutral-600 italic border-l-4 border-neutral-200 pl-6 my-6';
        case 'li':
            return 'text-[17px] leading-[1.9] text-neutral-800 pl-4 mb-2 before:content-["•"] before:mr-3 before:text-neutral-400';
        case 'figcaption':
            return 'text-sm text-neutral-500 italic text-center mt-2 mb-6';
        default:
            return 'text-[17px] leading-[1.9] text-neutral-800 mb-6';
    }
}

interface TappableArticleProps {
    html: string;
    onLookup: (phrase: string, context: string) => void;
    highlightedPhrases?: string[];
    onHighlightClick?: (phrase: string, context: string) => void;
    className?: string;
}

/**
 * TappableArticle — Renders article HTML with every word individually tappable,
 * using the same TapToSelect UI as the QuoteSwiper.
 */
export function TappableArticle({
    html,
    onLookup,
    highlightedPhrases = [],
    onHighlightClick,
    className,
}: TappableArticleProps) {
    const blocks = useMemo(() => parseHtmlBlocks(html), [html]);

    return (
        <div className={className}>
            {blocks.map((block, i) => {
                // Media-only blocks: render as raw HTML
                if (block.hasOnlyMedia) {
                    return (
                        <div
                            key={i}
                            className="my-6 prose prose-neutral max-w-none prose-img:mx-auto prose-img:max-w-full prose-img:h-auto prose-img:rounded-md"
                            dangerouslySetInnerHTML={{ __html: block.html }}
                        />
                    );
                }

                // Text blocks: render via TapToSelect
                return (
                    <TapToSelect
                        key={i}
                        text={block.text}
                        className={getBlockClassName(block.tag)}
                        style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                        onLookup={onLookup}
                        highlightedPhrases={highlightedPhrases}
                        onHighlightClick={onHighlightClick}
                    />
                );
            })}
        </div>
    );
}
