'use client';

import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
import { ArticleSection } from '@/lib/db/types';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { useVocabHighlighter } from './useVocabHighlighter';
import { EmbeddedQuestionCard } from '@/components/embedded-question-card';
// InlineQuiz removed — replaced by passage-centric session system
import { cn } from '@/lib/utils';
import { TappableArticle } from './TappableArticle';
import { ArrowLeft, ArrowRight, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { EmbeddedQuestion, Comment as FirestoreComment, RedditComment } from '@/lib/db/types';

const SWIPE_THRESHOLD = 60;
const VISIBLE_CARDS = 4;

// Stack position presets
const POSITIONS = {
    front: { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 },
    middle: { y: 14, x: 12, rotate: 3, scale: 0.97, opacity: 1 },
    back: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 1 },
    hidden: { y: 38, x: 8, rotate: -1, scale: 0.91, opacity: 0 },
    exit: { y: 26, x: -10, rotate: -2, scale: 0.94, opacity: 0 },
};

const SPRING = { type: 'spring' as const, stiffness: 100, damping: 18, mass: 1.2 };

// Unified item in the swipe stack
type SwipeItem =
    | { type: 'content'; section: ArticleSection; }
    | { type: 'question'; question: EmbeddedQuestion; }
    | { type: 'inline_quiz'; quizId: string; sectionContent: string; vocabPhrases: string[]; }
    | { type: 'comments'; comments: (FirestoreComment & { replies?: FirestoreComment[] })[]; redditComments: RedditComment[]; };

interface SwipeReaderProps {
    sections: ArticleSection[];
    highlightedPhrases?: string[];
    onPhraseClick: (phrase: string, context: string, rect: DOMRect) => void;
    onSectionChange?: (index: number) => void;
    currentSection?: number;
    autoAdvance?: boolean;
    savedPhrasesCount?: number;
    userId?: string;
    // MCQ props
    embeddedQuestions?: EmbeddedQuestion[];
    answeredQuestions?: Set<string>;
    onQuestionAnswer?: (id: string, correct: boolean) => void;
    // Comment props
    comments?: (FirestoreComment & { replies?: FirestoreComment[] })[];
    redditComments?: RedditComment[];
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
            `(?<!<\\w)\\b(${escaped})\\b(?![^<]*>)`,
            'gi'
        );
        result = result.replace(regex, '<mark class="vocab-highlight" data-phrase="$1">$1</mark>');
    }

    return result;
}

/** Inline reddit comment for swipe card */
function SwipeRedditComment({ comment, depth = 0 }: { comment: RedditComment; depth?: number }) {
    const [collapsed, setCollapsed] = useState(depth > 1);
    const hasChildren = comment.children && comment.children.length > 0;

    const depthColors = ['border-blue-200', 'border-neutral-200', 'border-amber-200'];
    const borderColor = depthColors[depth % depthColors.length];

    const initials = comment.author.slice(0, 2).toUpperCase();

    return (
        <div className={cn(depth > 0 && `ml-3 pl-3 border-l-2 ${borderColor}`)}>
            <div className="py-2">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 bg-neutral-200 flex items-center justify-center text-[9px] font-bold text-neutral-600 flex-shrink-0">
                        {initials}
                    </div>
                    <span className="text-xs font-semibold text-neutral-700">{comment.author}</span>
                    <span className="text-[10px] text-neutral-400">{comment.upvotes}↑</span>
                    {hasChildren && (
                        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-neutral-400">
                            {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        </button>
                    )}
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">{comment.body.slice(0, 300)}{comment.body.length > 300 ? '...' : ''}</p>
            </div>
            {!collapsed && hasChildren && (
                <div>
                    {comment.children.slice(0, 3).map((child) => (
                        <SwipeRedditComment key={child.id} comment={child} depth={depth + 1} />
                    ))}
                    {comment.children.length > 3 && (
                        <p className="text-[10px] text-neutral-400 pl-3 py-1">+{comment.children.length - 3} more replies</p>
                    )}
                </div>
            )}
        </div>
    );
}

/** Simple comment for swipe card (Firestore) */
function SwipeFirestoreComment({ comment }: { comment: FirestoreComment & { replies?: FirestoreComment[] } }) {
    const initial = comment.authorName?.charAt(0)?.toUpperCase() || '?';

    return (
        <div className="py-3 border-b border-neutral-100 last:border-0">
            <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-600 flex-shrink-0">
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-neutral-700">{comment.authorName || comment.authorUsername}</span>
                    <p className="text-xs text-neutral-600 leading-relaxed mt-0.5">{comment.content}</p>
                </div>
            </div>
            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="ml-8 mt-2 pl-3 border-l-2 border-neutral-100 space-y-2">
                    {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2">
                            <div className="w-5 h-5 bg-neutral-100 flex items-center justify-center text-[9px] font-bold text-neutral-500 flex-shrink-0">
                                {reply.authorName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <span className="text-[10px] font-semibold text-neutral-600">{reply.authorName || reply.authorUsername}</span>
                                <p className="text-[11px] text-neutral-500 leading-relaxed">{reply.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const SwipeReader = memo(function SwipeReader({
    sections,
    highlightedPhrases = [],
    onPhraseClick,
    onSectionChange,
    currentSection: controlledSection,
    autoAdvance,
    savedPhrasesCount = 0,
    userId,
    embeddedQuestions = [],
    answeredQuestions = new Set(),
    onQuestionAnswer,
    comments = [],
    redditComments = [],
    author = '',
    sourceTitle = '',
}: SwipeReaderProps & { author?: string; sourceTitle?: string }) {
    const [internalIndex, setInternalIndex] = useState(0);
    const activeIndex = controlledSection ?? internalIndex;
    const cardStackRef = useRef<HTMLDivElement>(null);

    const [quizCompletedIds, setQuizCompletedIds] = useState<Set<string>>(new Set());

    // Tap-to-lookup handler (pipes into global dictionary)
    const handleTapLookup = useCallback(
        (phrase: string, context: string) => {
            onPhraseClick(phrase, context, new DOMRect(0, 0, 0, 0));
        },
        [onPhraseClick]
    );

    // Build unified items array: content + questions + smart inline quizzes + comments
    const items: SwipeItem[] = useMemo(() => {
        const result: SwipeItem[] = [];
        let paragraphCount = 0;
        let quizzesInserted = 0;
        const maxQuizzesPerArticle = 2;

        for (const section of sections) {
            paragraphCount++;
            result.push({ type: 'content', section });

            // Insert questions that should appear after this paragraph
            const questionsHere = embeddedQuestions.filter(q => q.afterParagraph === paragraphCount);
            for (const question of questionsHere) {
                result.push({ type: 'question', question });
            }

            // Smart quiz placement: insert quiz ONLY after sections that contain vocab phrases
            const sectionVocab = section.vocabPhrases || [];
            if (
                userId &&
                quizzesInserted < maxQuizzesPerArticle &&
                sectionVocab.length > 0 &&
                paragraphCount >= 2 // Don't show quiz too early (after at least 2 sections)
            ) {
                result.push({
                    type: 'inline_quiz',
                    quizId: `quiz-after-${paragraphCount}`,
                    sectionContent: section.content,
                    vocabPhrases: sectionVocab,
                });
                quizzesInserted++;
            }
        }

        // Append comment cards at end
        const hasComments = comments.length > 0 || redditComments.length > 0;
        if (hasComments) {
            result.push({ type: 'comments', comments, redditComments });
        }

        return result;
    }, [sections, embeddedQuestions, comments, redditComments, userId]);

    // Apply rough-notation highlights when active card changes
    useVocabHighlighter(cardStackRef, [activeIndex, items]);
    const [phase, setPhase] = useState<'idle' | 'sending-to-back' | 'bringing-to-front'>('idle');
    const isAnimating = useRef(false);

    const dragX = useMotionValue(0);
    const dragRotate = useTransform(dragX, [-200, 0, 200], [-8, 0, 8]);

    // Check if forward swiping is blocked by unanswered question
    const isForwardBlocked = useMemo(() => {
        const currentItem = items[activeIndex];
        if (currentItem?.type === 'question') {
            return !answeredQuestions.has(currentItem.question.id);
        }
        return false;
    }, [items, activeIndex, answeredQuestions]);

    // Auto-advance effect
    useEffect(() => {
        if (autoAdvance && phase === 'idle') {
            sendToBack();
        }
    }, [autoAdvance]);

    const sendToBack = useCallback(() => {
        if (isAnimating.current || items.length <= 1) return;
        if (isForwardBlocked) return; // Block forward on unanswered question
        isAnimating.current = true;

        animate(dragX, 0, { duration: 0.1 });
        setPhase('sending-to-back');

        setTimeout(() => {
            const nextIndex = (activeIndex + 1) % items.length;
            if (controlledSection === undefined) {
                setInternalIndex(nextIndex);
            }
            onSectionChange?.(nextIndex);
            setPhase('idle');
            isAnimating.current = false;
        }, 500);
    }, [items.length, activeIndex, controlledSection, onSectionChange, dragX, isForwardBlocked]);

    const goBack = useCallback(() => {
        if (isAnimating.current || items.length <= 1) return;
        isAnimating.current = true;

        const prevIndex = (activeIndex - 1 + items.length) % items.length;
        if (controlledSection === undefined) {
            setInternalIndex(prevIndex);
        }
        onSectionChange?.(prevIndex);
        setPhase('bringing-to-front');

        setTimeout(() => {
            setPhase('idle');
            isAnimating.current = false;
        }, 500);
    }, [items.length, activeIndex, controlledSection, onSectionChange]);

    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (Math.abs(info.offset.x) > SWIPE_THRESHOLD || Math.abs(info.velocity.x) > 300) {
            if (info.offset.x < 0) {
                sendToBack();
            } else {
                goBack();
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
        if (phase === 'sending-to-back') {
            if (stackPos === 0) return POSITIONS.exit;
            if (stackPos === 1) return POSITIONS.front;
            if (stackPos === 2) return POSITIONS.middle;
            if (stackPos === 3) return POSITIONS.back;
            return POSITIONS.hidden;
        }
        if (phase === 'bringing-to-front') {
            if (stackPos === 0) return POSITIONS.front;
            if (stackPos === 1) return POSITIONS.middle;
            if (stackPos === 2) return POSITIONS.back;
            return POSITIONS.hidden;
        }
        if (stackPos === 0) return POSITIONS.front;
        if (stackPos === 1) return POSITIONS.middle;
        if (stackPos === 2) return POSITIONS.back;
        return POSITIONS.hidden;
    };

    // Build visible stack
    const cards = useMemo(() => {
        const result = [];
        for (let i = 0; i < Math.min(VISIBLE_CARDS, items.length); i++) {
            const idx = (activeIndex + i) % items.length;
            result.push({ item: items[idx], stackPos: i });
        }
        return result;
    }, [activeIndex, items]);

    // Render a card based on item type
    const renderCardContent = (item: SwipeItem) => {
        switch (item.type) {
            case 'content': {
                return (
                    <div className="flex flex-col h-full w-full">
                        <div className="flex-1 flex flex-col justify-center px-10 md:px-14 py-8 overflow-hidden">
                            {item.section.title && (
                                <h2
                                    className="text-base font-semibold text-neutral-900 mb-2"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    {item.section.title}
                                </h2>
                            )}
                            <TappableArticle
                                html={sanitizeRichHtml(item.section.content)}
                                onLookup={handleTapLookup}
                                highlightedPhrases={highlightedPhrases.length > 0 ? highlightedPhrases : item.section.vocabPhrases}
                                onHighlightClick={(phrase, context) => onPhraseClick(phrase, context, new DOMRect(0, 0, 0, 0))}
                                className="text-xl md:text-[24px] md:leading-[1.6] text-neutral-900 tracking-tight"
                            />
                        </div>

                        {/* Bottom bar */}
                        <div className="flex items-center justify-between px-10 md:px-14 py-4 border-t border-neutral-100 mt-auto bg-white">
                            <div className="flex flex-col min-w-0 flex-1 mr-4">
                                <span className="text-xs font-medium text-neutral-900 truncate">
                                    {author || 'Unknown Author'}
                                </span>
                                <span className="text-[11px] text-neutral-400 truncate">
                                    {sourceTitle || 'Unknown Source'}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            }

            case 'question': {
                return (
                    <div className="px-6 py-6">
                        <EmbeddedQuestionCard
                            question={item.question}
                            onAnswer={(id, correct) => onQuestionAnswer?.(id, correct)}
                            isAnswered={answeredQuestions.has(item.question.id)}
                            compact
                        />
                    </div>
                );
            }

            case 'inline_quiz': {
                // Legacy inline quizzes deprecated — session exercises now use passage-centric flow
                return (
                    <div className="px-6 py-6 flex flex-col justify-center h-full">
                        <div className="text-center text-neutral-400 text-sm">
                            <p>Quiz completed</p>
                        </div>
                    </div>
                );
            }

            case 'comments': {
                const hasReddit = item.redditComments.length > 0;
                const hasFirestore = item.comments.length > 0;

                return (
                    <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="w-8 h-8 bg-neutral-100 flex items-center justify-center">
                                <MessageSquare className="w-4 h-4 text-neutral-500" />
                            </div>
                            <h3 className="text-base font-bold text-neutral-900 font-sans">Discussion</h3>
                        </div>

                        {hasReddit && (
                            <div className="space-y-1">
                                {item.redditComments.map(c => (
                                    <SwipeRedditComment key={c.id} comment={c} />
                                ))}
                            </div>
                        )}

                        {hasFirestore && (
                            <div>
                                {item.comments.map(c => (
                                    <SwipeFirestoreComment key={c.id} comment={c} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
        }
    };

    if (items.length === 0) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 pb-32">
            {/* Progress indicator */}
            <div className="w-full max-w-[800px] mb-6 flex items-center justify-between px-2">
                <div className="flex-1 h-[2px] bg-neutral-200 mr-4">
                    <div
                        className="h-full bg-neutral-900 transition-all duration-300 ease-out"
                        style={{ width: `${((activeIndex + 1) / items.length) * 100}%` }}
                    />
                </div>
                <span className="text-[11px] text-neutral-400 font-medium tabular-nums">
                    {activeIndex + 1} / {items.length}
                </span>
            </div>

            {/* Card Stack */}
            <div ref={cardStackRef} className="relative w-full max-w-[800px] mx-auto min-h-[300px]">
                {[...cards].reverse().map(({ item, stackPos }) => {
                    const isTop = stackPos === 0;
                    const target = getCardTarget(stackPos);
                    const zIndex = VISIBLE_CARDS - stackPos;

                    // Check if current top card is an unanswered quiz (for blur gate)
                    const topItem = items[activeIndex];
                    const isQuizGateActive = topItem?.type === 'inline_quiz'
                        && !quizCompletedIds.has(topItem.quizId);
                    // Apply blur to non-top cards when quiz gate is active
                    const shouldBlur = !isTop && isQuizGateActive;

                    // Generate a stable key
                    const itemKey = item.type === 'content'
                        ? item.section.id
                        : item.type === 'question'
                            ? `q-${item.question.id}`
                            : item.type === 'inline_quiz'
                                ? item.quizId
                                : 'comments';

                    return (
                        <motion.div
                            key={itemKey}
                            className={cn(
                                "inset-x-0 top-0",
                                isTop ? "relative w-full" : "absolute w-full h-full"
                            )}
                            style={
                                isTop && phase === 'idle'
                                    ? { x: dragX, rotate: dragRotate, zIndex }
                                    : { zIndex: phase === 'sending-to-back' && isTop ? 0 : zIndex }
                            }
                            initial={
                                phase === 'bringing-to-front' && isTop
                                    ? { ...POSITIONS.hidden, x: POSITIONS.hidden.x, rotate: POSITIONS.hidden.rotate }
                                    : false
                            }
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
                                className={cn(
                                    'w-full h-[280px] bg-white border flex flex-col transition-shadow duration-300',
                                    isTop ? '' : 'overflow-hidden',
                                    item.type === 'question'
                                        ? 'border-neutral-300 bg-neutral-50'
                                        : item.type === 'comments'
                                            ? 'border-neutral-200 bg-white'
                                            : 'border-neutral-200'
                                )}
                                style={{
                                    boxShadow: isTop
                                        ? '0 8px 30px -5px rgba(0,0,0,0.12)'
                                        : '0 2px 10px rgba(0,0,0,0.05)',
                                    filter: shouldBlur ? 'blur(6px)' : 'none',
                                    pointerEvents: shouldBlur ? 'none' : 'auto',
                                    transition: 'filter 0.3s ease',
                                }}
                            >
                                <div className="w-full flex-1 h-full overflow-hidden flex flex-col">
                                    {renderCardContent(item)}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-6 mt-8 z-10 relative">
                <button
                    onClick={goBack}
                    className="h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                    aria-label="Previous"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                    onClick={sendToBack}
                    disabled={isForwardBlocked}
                    className={cn(
                        'h-14 w-14 bg-white flex items-center justify-center shadow-sm border border-neutral-200 transition-colors',
                        isForwardBlocked
                            ? 'text-neutral-200 cursor-not-allowed'
                            : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50'
                    )}
                    aria-label="Next"
                >
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>

            {/* Vocab Bank Redirect CTA (Shows on last content card) */}
            {activeIndex === items.length - 1 && savedPhrasesCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-[540px] mt-12 mb-8 z-10"
                >
                    <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100/50 w-full text-center transition-all hover:bg-blue-50/80">
                        <div className="flex items-center justify-center gap-4 mb-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 font-sans m-0">
                                {savedPhrasesCount} {savedPhrasesCount === 1 ? 'Phrase' : 'Phrases'} Saved
                            </h3>
                        </div>
                        <a
                            href="/vocab"
                            className="inline-flex w-full items-center justify-center px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-100 outline-none"
                        >
                            Review in Vocab Graph
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                        </a>
                    </div>
                </motion.div>
            )}

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
