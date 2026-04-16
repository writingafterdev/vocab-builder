'use client';

import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { useVocabHighlighter } from './useVocabHighlighter';
import { EmbeddedQuestionCard } from '@/components/embedded-question-card';
import { getWordAtPosition } from '@/hooks/use-global-dictionary';
import { RedditCommentTree } from '@/components/reddit-comment-tree';
import { cn } from '@/lib/utils';
import type { EmbeddedQuestion, Comment as FirestoreComment, RedditComment } from '@/lib/db/types';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';

interface ImmersedReaderProps {
    title: string;
    subtitle?: string;
    content: string;
    highlightedPhrases?: string[];
    onPhraseClick: (phrase: string, context: string, rect: DOMRect) => void;
    onProgressChange?: (progress: number) => void;
    savedPhrasesCount?: number;
    // MCQ props
    embeddedQuestions?: EmbeddedQuestion[];
    answeredQuestions?: Set<string>;
    onQuestionAnswer?: (id: string, correct: boolean) => void;
    // Comment props
    comments?: (FirestoreComment & { replies?: FirestoreComment[] })[];
    redditComments?: RedditComment[];
}

/**
 * Highlight vocab phrases in HTML content by wrapping them in <mark> tags.
 * Case-insensitive, avoids highlighting inside existing tags.
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

/** Simple comment thread for Firestore comments (parent + replies) */
function CommentThread({
    comment,
    replies = [],
}: {
    comment: FirestoreComment;
    replies?: FirestoreComment[];
}) {
    const [collapsed, setCollapsed] = useState(false);
    const initial = comment.authorName?.charAt(0)?.toUpperCase() || '?';

    return (
        <div className="border-b border-neutral-100 last:border-0 py-4">
            {/* Parent comment */}
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-neutral-200 flex items-center justify-center text-neutral-600 text-xs font-bold flex-shrink-0">
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-neutral-800">
                            {comment.authorName || comment.authorUsername}
                        </span>
                        {replies.length > 0 && (
                            <button
                                onClick={() => setCollapsed(!collapsed)}
                                className="text-neutral-400 hover:text-neutral-600 p-0.5"
                            >
                                {collapsed ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                )}
                            </button>
                        )}
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                    </p>
                </div>
            </div>

            {/* Replies */}
            {!collapsed && replies.length > 0 && (
                <div className="ml-11 mt-3 pl-4 border-l-2 border-neutral-100 space-y-3">
                    {replies.map((reply) => {
                        const replyInitial = reply.authorName?.charAt(0)?.toUpperCase() || '?';
                        return (
                            <div key={reply.id} className="flex items-start gap-2.5">
                                <div className="w-6 h-6 bg-neutral-100 flex items-center justify-center text-neutral-500 text-[10px] font-bold flex-shrink-0">
                                    {replyInitial}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-neutral-700">
                                        {reply.authorName || reply.authorUsername}
                                    </span>
                                    <p className="text-xs text-neutral-600 leading-relaxed mt-0.5 whitespace-pre-wrap">
                                        {reply.content}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export const ImmersedReader = memo(function ImmersedReader({
    title,
    subtitle,
    content,
    highlightedPhrases = [],
    onPhraseClick,
    onProgressChange,
    savedPhrasesCount = 0,
    embeddedQuestions = [],
    answeredQuestions = new Set(),
    onQuestionAnswer,
    comments = [],
    redditComments = [],
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
                return;
            }

            // Fallback: tap-to-select any word in the article
            const lookup = getWordAtPosition(e.nativeEvent);
            if (lookup) {
                e.stopPropagation();
                
                let rect = target.getBoundingClientRect();
                try {
                    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                    if (range) {
                        rect = range.getBoundingClientRect();
                    }
                } catch(err) {}

                onPhraseClick(lookup.word, lookup.context, rect);
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

    // Split content into paragraphs for MCQ interleaving
    const hasQuestions = embeddedQuestions.length > 0;

    // Find next unanswered question to determine blur point
    const blurAfterParagraph = useMemo(() => {
        if (!hasQuestions) return Infinity;
        for (const q of embeddedQuestions) {
            if (!answeredQuestions.has(q.id)) {
                return q.afterParagraph;
            }
        }
        return Infinity;
    }, [embeddedQuestions, answeredQuestions, hasQuestions]);

    // Render content: either with MCQs interleaved or as a single block
    const renderContent = () => {
        if (!hasQuestions) {
            // No questions — render as single block
            return (
                <div
                    ref={articleRef}
                    className="prose prose-neutral max-w-none leading-[1.9] text-[17px] text-neutral-800 prose-headings:font-sans prose-headings:font-bold prose-p:mb-6"
                    style={{ fontFamily: 'Georgia, serif' }}
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{ __html: processedContent }}
                />
            );
        }

        // Split into paragraphs for MCQ insertion
        const paragraphs = processedContent.split(/(?=<p[ >])/i).filter(p => p.trim());

        return (
            <div
                ref={articleRef}
                className="prose prose-neutral max-w-none leading-[1.9] text-[17px] text-neutral-800 prose-headings:font-sans prose-headings:font-bold prose-p:mb-6"
                style={{ fontFamily: 'Georgia, serif' }}
                onClick={handleContentClick}
            >
                {paragraphs.map((paragraph, index) => {
                    const paragraphNumber = index + 1;
                    const isBlurred = paragraphNumber > blurAfterParagraph;

                    const questionForParagraph = embeddedQuestions.find(
                        q => q.afterParagraph === paragraphNumber && !answeredQuestions.has(q.id)
                    );

                    return (
                        <div key={index}>
                            <div
                                className={cn(
                                    'transition-all duration-300',
                                    isBlurred && 'blur-sm select-none pointer-events-none'
                                )}
                                dangerouslySetInnerHTML={{ __html: paragraph }}
                            />

                            {questionForParagraph && onQuestionAnswer && (
                                <EmbeddedQuestionCard
                                    question={questionForParagraph}
                                    onAnswer={onQuestionAnswer}
                                    isAnswered={answeredQuestions.has(questionForParagraph.id)}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const hasComments = comments.length > 0 || redditComments.length > 0;

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

                    {/* Body Content (with or without MCQs) */}
                    {renderContent()}

                    {/* Vocab Bank Redirect CTA */}
                    {savedPhrasesCount > 0 && (
                        <div className="mt-16 pt-8 border-t border-neutral-100 flex flex-col items-center">
                            <div className="bg-blue-50/50 rounded-2xl p-8 border border-blue-100/50 w-full text-center max-w-md mx-auto transition-all hover:bg-blue-50/80">
                                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
                                </div>
                                <h3 className="text-xl font-semibold text-slate-800 mb-2 font-sans">
                                    {savedPhrasesCount} {savedPhrasesCount === 1 ? 'Phrase' : 'Phrases'} Saved
                                </h3>
                                <p className="text-slate-500 mb-6 font-sans text-sm">
                                    You've extracted some great vocabulary from this article. Go check out how they connect in your graph.
                                </p>
                                <a
                                    href="/vocab"
                                    className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus:ring-4 focus:ring-blue-100 outline-none"
                                >
                                    Review in Vocab Graph
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Comments Section */}
                    {hasComments && (
                        <div className="mt-16 pt-8 border-t border-neutral-200">
                            {/* Reddit comments */}
                            {redditComments.length > 0 && (
                                <RedditCommentTree
                                    comments={redditComments}
                                />
                            )}

                            {/* Regular Firestore comments */}
                            {comments.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-neutral-900 mb-6 flex items-center gap-3 font-sans">
                                        <div className="w-9 h-9 bg-neutral-100 flex items-center justify-center">
                                            <MessageSquare className="w-4.5 h-4.5 text-neutral-500" />
                                        </div>
                                        <span>Discussion</span>
                                        <span className="text-sm font-normal text-neutral-400">
                                            ({comments.length})
                                        </span>
                                    </h3>
                                    <div className="divide-y divide-neutral-100">
                                        {comments.map((comment) => (
                                            <CommentThread
                                                key={comment.id}
                                                comment={comment}
                                                replies={comment.replies}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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
