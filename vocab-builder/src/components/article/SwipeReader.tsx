'use client';

import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
import { ArticleSection } from '@/lib/db/types';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { useVocabHighlighter } from './useVocabHighlighter';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const SWIPE_THRESHOLD = 60;
const VISIBLE_CARDS = 3;

// Stack position presets
const POSITIONS = {
    front: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    middle: { y: 14, x: 12, rotate: 3, scale: 0.97, opacity: 1 },
    back: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 1 },
    exit: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 0 },
};

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 18, mass: 1.2 };

interface SwipeReaderProps {
    sections: ArticleSection[];
    highlightedPhrases?: string[];
    onPhraseClick: (phrase: string, context: string, rect: DOMRect) => void;
    onSectionChange?: (index: number) => void;
    currentSection?: number;
    autoAdvance?: boolean;
}

/**
 * Highlight vocab phrases in HTML content
 */
function highlightPhrases(html: string, phrases: string[]): string {
    if (!phrases || phrases.length === 0) return html;

    let result = html;
    const sorted = [...phrases].sort((a, b) => b.length - a.length);

    for (const phrase of sorted) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
            `(?<![<\\w])\\b(${escaped})\\b(?![^<]*>)`,
            'gi'
        );
        result = result.replace(regex, '<mark class="vocab-highlight" data-phrase="$1">$1</mark>');
    }

    return result;
}

export const SwipeReader = memo(function SwipeReader({
    sections,
    highlightedPhrases = [],
    onPhraseClick,
    onSectionChange,
    currentSection: controlledSection,
    autoAdvance,
}: SwipeReaderProps) {
    const [internalIndex, setInternalIndex] = useState(0);
    const activeIndex = controlledSection ?? internalIndex;
    const cardStackRef = useRef<HTMLDivElement>(null);

    // Apply rough-notation highlights when active card changes
    useVocabHighlighter(cardStackRef, [activeIndex, sections]);
    const [phase, setPhase] = useState<'idle' | 'sending-to-back'>('idle');
    const isAnimating = useRef(false);

    const dragX = useMotionValue(0);
    const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

    // Auto-advance effect
    useEffect(() => {
        if (autoAdvance && phase === 'idle') {
            sendToBack();
        }
    }, [autoAdvance]);

    const sendToBack = useCallback(() => {
        if (isAnimating.current || sections.length <= 1) return;
        isAnimating.current = true;

        animate(dragX, 0, { duration: 0.1 });
        setPhase('sending-to-back');

        setTimeout(() => {
            const nextIndex = (activeIndex + 1) % sections.length;
            if (controlledSection === undefined) {
                setInternalIndex(nextIndex);
            }
            onSectionChange?.(nextIndex);
            setPhase('idle');
            isAnimating.current = false;
        }, 500);
    }, [sections.length, activeIndex, controlledSection, onSectionChange, dragX]);

    const goBack = useCallback(() => {
        if (isAnimating.current || sections.length <= 1) return;
        const prevIndex = (activeIndex - 1 + sections.length) % sections.length;
        if (controlledSection === undefined) {
            setInternalIndex(prevIndex);
        }
        onSectionChange?.(prevIndex);
    }, [sections.length, activeIndex, controlledSection, onSectionChange]);

    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (Math.abs(info.offset.x) > SWIPE_THRESHOLD || Math.abs(info.velocity.x) > 300) {
            if (info.offset.x < 0) {
                sendToBack(); // Swipe left = next
            } else {
                goBack(); // Swipe right = previous
            }
        } else {
            animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 25 });
        }
    }, [sendToBack, goBack, dragX]);

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

    const getCardTarget = (stackPos: number) => {
        if (stackPos === 0 && phase === 'sending-to-back') return POSITIONS.exit;
        if (stackPos === 0) return POSITIONS.front;
        if (stackPos === 1) return POSITIONS.middle;
        return POSITIONS.back;
    };

    // Build visible stack
    const cards = useMemo(() => {
        const result = [];
        for (let i = 0; i < Math.min(VISIBLE_CARDS, sections.length); i++) {
            const idx = (activeIndex + i) % sections.length;
            result.push({ section: sections[idx], stackPos: i });
        }
        return result;
    }, [activeIndex, sections]);

    if (sections.length === 0) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 pb-32">
            {/* Progress bar */}
            <div className="w-full max-w-[540px] mb-10">
                <div className="w-full h-[2px] bg-neutral-200">
                    <div
                        className="h-full bg-neutral-900 transition-all duration-300 ease-out"
                        style={{ width: `${((activeIndex + 1) / sections.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Card Stack */}
            <div ref={cardStackRef} className="relative w-full max-w-[540px] mx-auto min-h-[220px]">
                {[...cards].reverse().map(({ section, stackPos }) => {
                    const isTop = stackPos === 0;
                    const target = getCardTarget(stackPos);
                    const zIndex = VISIBLE_CARDS - stackPos;

                    const processedContent = highlightPhrases(
                        sanitizeRichHtml(section.content),
                        highlightedPhrases.length > 0 ? highlightedPhrases : section.vocabPhrases
                    );

                    return (
                        <motion.div
                            key={section.id}
                            className="absolute inset-x-0 top-0"
                            style={
                                isTop && phase === 'idle'
                                    ? { x: dragX, rotate: dragRotate, zIndex }
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
                        >
                            {/* Card */}
                            <div
                                className="w-full bg-white border border-neutral-200 flex flex-col"
                                style={{
                                    boxShadow: isTop && phase === 'idle'
                                        ? '0 8px 30px -5px rgba(0,0,0,0.12)'
                                        : '0 2px 10px rgba(0,0,0,0.05)',
                                }}
                            >
                                {/* Section title */}
                                {section.title && (
                                    <div className="px-8 pt-6 pb-1">
                                        <h2
                                            className="text-base font-semibold text-neutral-900"
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                        >
                                            {section.title}
                                        </h2>
                                    </div>
                                )}

                                {/* Section content */}
                                <div
                                    className="px-8 py-6 prose prose-neutral prose-sm max-w-none leading-[1.85] text-neutral-800"
                                    style={{ fontFamily: 'var(--font-serif), "Instrument Serif", Georgia, serif' }}
                                    onClick={handleContentClick}
                                    dangerouslySetInnerHTML={{ __html: processedContent }}
                                />
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-6 mt-8 z-10 relative">
                <button
                    onClick={goBack}
                    className="h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors rounded-full"
                    aria-label="Previous"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={sendToBack}
                    className="h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors rounded-full"
                    aria-label="Next"
                >
                    <ArrowRight className="w-5 h-5" />
                </button>
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
