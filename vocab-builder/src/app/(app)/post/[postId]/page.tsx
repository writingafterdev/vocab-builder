'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getPost } from '@/lib/db/posts';
import { updatePost } from '@/lib/db/admin';
import { getComments, getReplies, addComment } from '@/lib/db/comments';
import { repostPost, hasUserReposted, likeComment, getBatchUserLikes } from '@/lib/db/social';
import { saveArticle, unsaveArticle, isArticleSaved } from '@/lib/db/bookmarks';
import { Post, Comment, LexileLevel, EmbeddedQuestion } from '@/lib/db/types';
import { ArticleReadingMode } from '@/components/article/ArticleReadingMode';
import {
    ArrowLeft, MessageCircle, Heart, Repeat2, Loader2,
    Type, Pencil, Plus, Sparkles, Volume2, BookText,
    ChevronLeft, ChevronRight, Bookmark, Filter, BookmarkPlus, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { cn, toDateSafe } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-context';
import TextHighlighter from '@/components/text-highlighter';
import { getSourceLogo } from '@/lib/sources';
import { useConfirm } from '@/components/confirm-dialog';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionVocab, SessionVocabItem } from '@/hooks/use-session-vocab';
import { trackArticleRead } from '@/lib/article-tracking';
import { SpeakButton } from '@/hooks/use-text-to-speech';
import { TagSelector } from '@/components/tag-selector';
import { CollapsibleSection } from '@/components/collapsible-section';
import { EmbeddedQuestionCard } from '@/components/embedded-question-card';
import { useGlobalDictionary, getWordAtPosition } from '@/hooks/use-global-dictionary';
import { GlobalPhraseData, RedditComment } from '@/lib/db/types';
import { RedditCommentTree } from '@/components/reddit-comment-tree';
import { ArticleReader } from '@/components/article-reader';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

function formatTimeAgo(date: Date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function formatDate(date: Date) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

// Collapsed Right Sidebar (default state from mockup)
function CollapsedSidebar({
    onExpand,
    hasNewItems,
    bookmarked,
    onBookmark,
    bookmarking,
    onExtractVocab,
    isExtractingVocab,
    hasVocab,
    onGenerateAudio,
    isGeneratingAudio,
    hasAudio,
}: {
    onExpand: () => void;
    hasNewItems: boolean;
    bookmarked: boolean;
    onBookmark: () => void;
    bookmarking: boolean;
    onExtractVocab: () => void;
    isExtractingVocab: boolean;
    hasVocab: boolean;
    onGenerateAudio: () => void;
    isGeneratingAudio: boolean;
    hasAudio: boolean;
}) {
    return (
        <aside className="w-16 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col items-center z-20 font-sans">
            {/* Expand button */}
            <div className="h-16 w-full flex items-center justify-center border-b border-slate-100">
                <button
                    onClick={onExpand}
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                    title="Expand Sidebar"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center py-6 gap-8 overflow-hidden">
                {/* Session Vocab label - vertical */}
                <div className="flex flex-col items-center gap-3 cursor-pointer group" onClick={onExpand} title="Open Session Vocab">
                    <div
                        className="text-xs font-semibold text-slate-500 group-hover:text-blue-600 transition-colors tracking-widest uppercase whitespace-nowrap py-2"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
                    >
                        Session Vocab
                    </div>
                    {/* Pulsing notification dot */}
                    {hasNewItems && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-600 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
                        </span>
                    )}
                </div>

                <div className="w-8 h-px bg-slate-100" />

                {/* Icon buttons - 3 buttons: Bookmark, Extract Vocab, Audio */}
                <div className="flex flex-col gap-4 w-full px-2">
                    <button
                        onClick={onBookmark}
                        disabled={bookmarking}
                        className={`w-full aspect-square flex items-center justify-center rounded-lg hover:bg-slate-50 transition-colors relative ${bookmarked ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'
                            }`}
                        title={bookmarked ? 'Remove from Saved' : 'Save Article'}
                    >
                        <Bookmark className={`h-5 w-5 ${bookmarked ? 'fill-current' : ''}`} />
                    </button>
                    <button
                        onClick={onExtractVocab}
                        disabled={isExtractingVocab || hasVocab}
                        className={`w-full aspect-square flex items-center justify-center rounded-lg hover:bg-slate-50 transition-colors ${hasVocab ? 'text-green-600' : isExtractingVocab ? 'text-purple-600 animate-pulse' : 'text-slate-400 hover:text-purple-600'}`}
                        title={hasVocab ? 'Vocabulary Extracted' : 'Extract Vocabulary'}
                    >
                        {isExtractingVocab ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    </button>
                    <button
                        onClick={onGenerateAudio}
                        disabled={isGeneratingAudio || hasAudio}
                        className={`w-full aspect-square flex items-center justify-center rounded-lg hover:bg-slate-50 transition-colors ${hasAudio ? 'text-green-600' : isGeneratingAudio ? 'text-orange-600 animate-pulse' : 'text-slate-400 hover:text-orange-600'}`}
                        title={hasAudio ? 'Audio Available' : 'Generate Audio'}
                    >
                        {isGeneratingAudio ? <Loader2 className="h-5 w-5 animate-spin" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                </div>

                {/* Add Note button at bottom */}
                <div className="mt-auto mb-2 w-full px-2">
                    <button className="w-full aspect-square flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-600 hover:bg-slate-50 transition-all" title="Add Note">
                        <Plus className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </aside>
    );
}

// Expanded Right Sidebar with collapsible vocab cards and resizable width
function ExpandedSidebar({
    onCollapse,
    vocabItems,
    onSaveToBank,
    width,
    onWidthChange,
    topicVocab = [],
    onHighlightWord,
}: {
    onCollapse: () => void;
    vocabItems: SessionVocabItem[];
    onSaveToBank: (item: SessionVocabItem) => void;
    width: number;
    onWidthChange: (width: number) => void;
    topicVocab?: { word: string; meaning: string; partOfSpeech: string; topic: string; frequency: string; example?: string }[];
    onHighlightWord?: (word: string | null) => void;
}) {
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [isResizing, setIsResizing] = useState(false);
    const [adjustedPositions, setAdjustedPositions] = useState<Map<string, number>>(new Map());
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Calculate positions based on actual heights
    const recalculatePositions = useCallback(() => {
        const HEADER_OFFSET = 64;
        const GAP = 16;

        // Sort items by yPosition
        const sortedItems = [...vocabItems]
            .filter(item => item.yPosition !== undefined)
            .sort((a, b) => (a.yPosition || 0) - (b.yPosition || 0));

        if (sortedItems.length === 0) return;

        // Calculate adjusted positions based on actual measured heights
        const newPositions = new Map<string, number>();
        let lastBottom = 0;

        sortedItems.forEach(item => {
            const idealTop = (item.yPosition || 0) - HEADER_OFFSET;
            const adjustedTop = Math.max(idealTop, lastBottom);
            newPositions.set(item.id, adjustedTop);

            // Get actual height from ref, or estimate
            const cardEl = cardRefs.current.get(item.id);
            const actualHeight = cardEl?.offsetHeight || 200;
            lastBottom = adjustedTop + actualHeight + GAP;
        });

        setAdjustedPositions(newPositions);
    }, [vocabItems]);

    // Initial position calculation
    useEffect(() => {
        recalculatePositions();
    }, [vocabItems, expandedCards, recalculatePositions]);

    // Use ResizeObserver to watch for card height changes (expand/collapse animations)
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            recalculatePositions();
        });

        // Observe all cards
        cardRefs.current.forEach(el => {
            observer.observe(el);
        });

        return () => observer.disconnect();
    }, [vocabItems, recalculatePositions]);

    // Handle resize drag
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = width;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX;
            const newWidth = Math.min(600, Math.max(280, startWidth + delta));
            onWidthChange(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <motion.aside
            initial={{ width: 0 }}
            animate={{ width }}
            exit={{ width: 0 }}
            transition={{ duration: isResizing ? 0 : 0.2 }}
            className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col z-20 overflow-hidden font-sans relative"
        >
            {/* Resize Handle */}
            <div
                onMouseDown={handleMouseDown}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400 transition-colors z-30 group"
            >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-slate-300 group-hover:bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div style={{ width }} className="h-full flex flex-col">
                {/* Header - Sticky */}
                <div className="w-full h-16 flex items-center justify-between px-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                    <h3 className="font-bold text-slate-900">Session Vocab</h3>
                    <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                            <Filter className="h-4 w-4 text-slate-400" />
                        </button>
                        <button
                            onClick={onCollapse}
                            className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                            title="Collapse sidebar"
                        >
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Vocab Cards - Absolute positioned to align with phrases in document */}
                <div className="w-full flex-1 overflow-y-auto relative" style={{ minHeight: '100%' }}>
                    {/* Topic Vocabulary Pills - Quick reference only */}
                    {/* Words are highlighted in article - click to add to session vocab */}
                    {topicVocab.length > 0 && (
                        <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="w-4 h-4 text-purple-600" />
                                <span className="text-xs font-semibold text-purple-700">Topic Vocabulary</span>
                                <span className="text-xs text-purple-500">({topicVocab.length})</span>
                            </div>
                            <p className="text-[10px] text-purple-400 mb-2">Click highlighted words in article to learn</p>
                            <div className="flex flex-wrap gap-1.5">
                                {topicVocab.map((item, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-block px-2 py-1 bg-white rounded text-xs font-medium text-purple-700 border border-purple-200 hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-all"
                                        onMouseEnter={() => onHighlightWord?.(item.word)}
                                        onMouseLeave={() => onHighlightWord?.(null)}
                                        title={item.meaning}
                                    >
                                        {item.word}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {vocabItems.length === 0 ? (
                        <div className="text-center py-8 px-4">
                            <p className="text-sm text-slate-500 mb-2">No words saved yet</p>
                            <p className="text-xs text-slate-400">Click highlighted phrases to see meanings</p>
                        </div>
                    ) : (
                        vocabItems.map((item, i) => {
                            const isExpanded = expandedCards.has(item.id);
                            const hasCommonUsages = (item.commonUsages?.length ?? 0) > 0;
                            // All cards are now collapsible
                            const hasExpandableContent = true;

                            // Use dynamically calculated position from adjustedPositions state
                            const adjustedTop = adjustedPositions.get(item.id);
                            const cardStyle = adjustedTop !== undefined
                                ? { position: 'absolute' as const, top: adjustedTop, left: 4, right: 4, zIndex: 40 - i }
                                : { position: 'relative' as const, margin: 4 };

                            return (
                                <motion.div
                                    key={item.id}
                                    ref={(el) => {
                                        if (el) cardRefs.current.set(item.id, el);
                                        else cardRefs.current.delete(item.id);
                                    }}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden"
                                    style={cardStyle}
                                >
                                    {/* Loading state */}
                                    {item.isLoading ? (
                                        <div className="flex items-center gap-2 p-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                            <span className="text-sm text-slate-500">Looking up "{item.phrase}"...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Collapsible Header - using div to avoid nested button issue */}
                                            <div
                                                onClick={() => hasExpandableContent && toggleCard(item.id)}
                                                className={`w-full text-left p-4 ${hasExpandableContent ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-slate-900">{item.phrase}</h4>
                                                            <div onClick={(e) => e.stopPropagation()}>
                                                                <SpeakButton text={item.phrase} size="sm" />
                                                            </div>
                                                            {i === 0 && (
                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">New</span>
                                                            )}
                                                        </div>
                                                        {item.phonetic && (
                                                            <p className="text-xs text-slate-400 font-mono mb-1">{item.phonetic}</p>
                                                        )}
                                                        {item.meanings[0] && (
                                                            <p className="text-sm text-slate-600 line-clamp-2">
                                                                {item.meanings[0].definitions[0]?.definition}
                                                            </p>
                                                        )}
                                                        {/* Sentence Translation */}
                                                        {item.sentenceTranslation && (
                                                            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                                                <p className="text-xs text-blue-700">
                                                                    <span className="font-medium">🇻🇳 </span>
                                                                    {item.sentenceTranslation}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Expand indicator */}
                                                    {hasExpandableContent && (
                                                        <div className={`ml-2 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                            <ChevronLeft className="h-4 w-4 -rotate-90" />
                                                        </div>
                                                    )}
                                                    {item.isEnriching && !hasExpandableContent && (
                                                        <Loader2 className="h-4 w-4 animate-spin text-purple-500 ml-2" />
                                                    )}
                                                </div>

                                                {/* Tags row */}
                                                {item.meanings[0]?.partOfSpeech && (
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            {item.meanings[0].partOfSpeech}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Collapsible content - only show when expanded */}
                                            {isExpanded && (
                                                <>

                                                    {/* Word Breakdown Section (for phrases) */}
                                                    {item.componentWords && item.componentWords.length > 0 && (
                                                        <CollapsibleSection
                                                            title="Word Breakdown"
                                                            count={item.componentWords.length}
                                                            defaultOpen={false}
                                                        >
                                                            <div className="space-y-2">
                                                                {item.componentWords.map((word, idx) => (
                                                                    <div key={idx} className="bg-white rounded-lg p-3 border border-slate-200">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <p className="font-medium text-sm text-slate-800">{word.word}</p>
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                                                                {word.partOfSpeech}
                                                                            </span>
                                                                            {word.isHighFrequency && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                                                                    ⚡ High Freq
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-xs text-slate-500">{word.meaning}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </CollapsibleSection>
                                                    )}

                                                    {/* Context Section */}
                                                    {item.context && (
                                                        <CollapsibleSection
                                                            title="Context"
                                                            defaultOpen={false}
                                                        >
                                                            <div className="bg-white rounded-lg p-3 border border-slate-200">
                                                                <p className="text-xs text-slate-600 italic">"{item.context}"</p>
                                                                {item.sentenceTranslation && (
                                                                    <p className="text-xs text-blue-600 mt-2">
                                                                        🇻🇳 {item.sentenceTranslation}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </CollapsibleSection>
                                                    )}


                                                    {/* Common usages loading is silent - no UI shown */}

                                                    {/* Tag Selector - AI suggestions that user can edit */}
                                                    {!item.isSaved && (
                                                        <TagSelector
                                                            phrase={item.phrase}
                                                            meaning={item.meanings[0]?.definitions[0]?.definition || ''}
                                                            context={item.context}
                                                            isLoading={item.isLoadingTags}
                                                            selectedRegister={item.suggestedRegister || 'consultative'}
                                                            selectedNuance={item.suggestedNuance || 'neutral'}
                                                            selectedSocialDistance={item.suggestedSocialDistance}
                                                            selectedTopic={item.suggestedTopic || 'general'}
                                                            selectedSubtopic={item.suggestedSubtopic}
                                                        />
                                                    )}

                                                    {/* Read-only tags display for saved items */}
                                                    {item.isSaved && (
                                                        <div className="border-t border-slate-100 p-3 bg-slate-50/50">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {/* Register badge */}
                                                                {(() => {
                                                                    const reg = item.suggestedRegister;
                                                                    const regVal = Array.isArray(reg) ? reg[0] : reg || 'consultative';
                                                                    return (
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${regVal === 'casual'
                                                                            ? 'bg-green-100 text-green-700'
                                                                            : regVal === 'formal'
                                                                                ? 'bg-purple-100 text-purple-700'
                                                                                : 'bg-blue-100 text-blue-700'
                                                                            }`}>
                                                                            {regVal.charAt(0).toUpperCase() + regVal.slice(1)}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {/* Nuance badge */}
                                                                {(() => {
                                                                    const nua = item.suggestedNuance;
                                                                    const nuaVal = Array.isArray(nua) ? nua[0] : nua || 'neutral';
                                                                    return (
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${nuaVal === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                                                                            nuaVal === 'slightly_positive' ? 'bg-lime-100 text-lime-700' :
                                                                                nuaVal === 'slightly_negative' ? 'bg-orange-100 text-orange-700' :
                                                                                    nuaVal === 'negative' ? 'bg-red-100 text-red-700' :
                                                                                        'bg-slate-100 text-slate-700'
                                                                            }`}>
                                                                            {nuaVal.replace(/_/g, ' ')}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {/* Topic badge */}
                                                                {(() => {
                                                                    const top = item.suggestedTopic;
                                                                    const topVal = Array.isArray(top) ? top[0] : top || 'general';
                                                                    return (
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${topVal === 'high_frequency'
                                                                            ? 'bg-amber-100 text-amber-700'
                                                                            : 'bg-indigo-100 text-indigo-700'
                                                                            }`}>
                                                                            {topVal.replace(/_/g, ' ')}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {/* Subtopic badge */}
                                                                {(() => {
                                                                    const sub = item.suggestedSubtopic;
                                                                    if (!sub) return null;
                                                                    const subVal = Array.isArray(sub) ? sub[0] : sub;
                                                                    return (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700">
                                                                            {subVal.replace(/_/g, ' ')}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Save button */}
                                                    <div className="p-3 pt-0">
                                                        {!item.isSaved ? (
                                                            <button
                                                                onClick={() => onSaveToBank(item)}
                                                                disabled={item.isSaving}
                                                                className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${item.isSaving ? 'text-blue-400 bg-blue-50/50 border-blue-100 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50 border-blue-200'}`}
                                                            >
                                                                {item.isSaving ? (
                                                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
                                                                ) : (
                                                                    <><BookmarkPlus className="h-3.5 w-3.5" /> Save to Vocab Bank</>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg">
                                                                <Bookmark className="h-3.5 w-3.5 fill-current" />
                                                                Saved
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* Add Manual Note */}
                <div className="p-4 border-t border-slate-100">
                    <button className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg border border-dashed border-slate-300 transition-colors">
                        <Plus className="h-4 w-4" />
                        Add Manual Note
                    </button>
                </div>
            </div>
        </motion.aside >
    );
}

export default function PostPage() {
    const params = useParams();
    const postId = params.postId as string;
    const { user, profile } = useAuth();
    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [reposted, setReposted] = useState(false);
    const [repostCount, setRepostCount] = useState(0);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [bookmarked, setBookmarked] = useState(false);
    const [bookmarking, setBookmarking] = useState(false);
    const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
    const [sidebarExpanded, setSidebarExpanded] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(380);
    const [readingProgress, setReadingProgress] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const hasTrackedRead = useRef(false); // Track if we've counted this article as read
    const { confirm, DialogComponent } = useConfirm();

    // Leveled reading state
    const [selectedLevel, setSelectedLevel] = useState<LexileLevel>('B2');
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
    const [selectedQuestionAnswer, setSelectedQuestionAnswer] = useState<number | null>(null);
    const [showQuestionResult, setShowQuestionResult] = useState(false);

    // Scan state
    const [isScanning, setIsScanning] = useState(false);

    // Topic vocab and audio generation state
    const [isExtractingVocab, setIsExtractingVocab] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [highlightedWord, setHighlightedWord] = useState<string | null>(null);

    // Session vocab hook for dictionary-first lookup (persisted per postId)
    const { vocabItems, addVocab, addVocabWithData, markAsSaved, updateVocab } = useSessionVocab(user?.uid, user?.email || undefined, postId);

    // Global Phrase Dictionary hook
    const { lookupPhrase, isLoading: dictionaryLoading } = useGlobalDictionary();

    // Convert GlobalPhraseData to SessionVocabItem format
    const convertToSessionVocab = useCallback((data: GlobalPhraseData, context?: string): SessionVocabItem => {
        return {
            id: data.phraseKey,
            phrase: data.phrase,
            phonetic: data.pronunciation,
            meanings: [{
                partOfSpeech: Array.isArray(data.topic) ? data.topic[0] : (data.topic || 'phrase'),
                definitions: [{
                    definition: data.meaning,
                    example: data.context,
                }],
            }],
            commonUsages: data.commonUsages || [],
            context: context || data.context,
            sentenceTranslation: data.contextTranslation,
            suggestedRegister: data.register,
            suggestedNuance: data.nuance,
            suggestedTopic: data.topic,
            suggestedSubtopic: data.subtopic,
            source: 'prebuilt',
            timestamp: Date.now(),
        };
    }, []);

    // Handle text selection/click for Global Dictionary lookup
    const handleTextLookup = useCallback(async (e: React.MouseEvent) => {
        // Try to get selected text or word at position
        const result = getWordAtPosition(e.nativeEvent);
        if (!result || !result.word || result.word.length < 2) return;

        // Lookup in Global Dictionary
        const phraseData = await lookupPhrase(result.word, result.context);
        if (phraseData) {
            const vocabItem = convertToSessionVocab(phraseData, result.context);
            // Add to session vocab with full data
            addVocabWithData({
                phrase: phraseData.phrase,
                meaning: phraseData.meaning,
                example: phraseData.context,
                sentenceTranslation: phraseData.contextTranslation,
                register: phraseData.register,
                nuance: phraseData.nuance,
                topic: phraseData.topic,
                subtopic: phraseData.subtopic,
                isHighFrequency: phraseData.isHighFrequency,
                commonUsages: phraseData.commonUsages,
            }, result.context);
            setSidebarExpanded(true);
        }
    }, [lookupPhrase, convertToSessionVocab, addVocabWithData]);


    // Handle saving vocab to the bank (root + children)
    const handleSaveToVocabBank = async (item: SessionVocabItem) => {
        if (!user) {
            toast.error('Please sign in to save vocabulary');
            return;
        }
        if (item.isSaving) return;

        updateVocab(item.id, { isSaving: true });

        try {
            // Use AI-assigned tags (read-only, not user-editable)
            const topic = item.suggestedTopic || 'daily_life';
            const subtopic = item.suggestedSubtopic;

            // Save to Firestore - children start empty, potentialUsages saved for exercise generation
            const response = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.uid,
                    'x-user-email': user.email || '',
                },
                body: JSON.stringify({
                    phrase: item.phrase,
                    meaning: item.meanings[0]?.definitions[0]?.definition || '',
                    context: item.context || '',
                    register: item.suggestedRegister || 'consultative',
                    nuance: item.suggestedNuance || 'neutral',
                    topics: Array.isArray(topic) ? topic : [topic],
                    subtopics: subtopic ? (Array.isArray(subtopic) ? subtopic : [subtopic]) : [],
                    // Children start empty - populated through exercises later
                    // potentialUsages saved silently for exercise generation
                    potentialUsages: item.commonUsages || [],
                }),
            });

            if (!response.ok) throw new Error('Failed to save');

            // Update daily counter for real-time widget update
            import('@/lib/daily-counter').then(({ incrementDailyCount }) => {
                incrementDailyCount(1); // Only count the root phrase
            });

            markAsSaved(item.id);
            toast.success(`Saved "${item.phrase}"!`);
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save vocabulary');
        } finally {
            updateVocab(item.id, { isSaving: false });
        }
    };

    // Tags are now pre-built in vocabularyData - no API call needed
    // Suggested tags are populated in addVocabWithData from prebuilt data

    // Track reading progress
    const handleScroll = useCallback(() => {
        if (!contentRef.current) return;
        const element = contentRef.current;
        const scrollTop = element.scrollTop;
        const scrollHeight = element.scrollHeight - element.clientHeight;
        const progress = scrollHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100)) : 0;
        const roundedProgress = Math.round(progress);
        setReadingProgress(roundedProgress);

        // Track as read when user scrolls past 50%
        if (roundedProgress >= 50 && !hasTrackedRead.current && post?.isArticle && post?.id) {
            hasTrackedRead.current = true;
            trackArticleRead(post.id);

            // Track interaction for recommendation engine
            if (user?.uid && (post as any).importTopic) {
                fetch('/api/user/track-interaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': user.uid },
                    body: JSON.stringify({ postId: post.id, action: 'read', topic: (post as any).importTopic })
                }).catch(console.error);
            }
        }
    }, [post]);

    // Load post data
    useEffect(() => {
        const loadData = async () => {
            if (!postId) return;
            try {
                const [fetchedPost, fetchedComments] = await Promise.all([
                    getPost(postId),
                    getComments(postId)
                ]);
                setPost(fetchedPost);
                const commentsWithReplies = await Promise.all(
                    fetchedComments.map(async (c) => {
                        const replies = await getReplies(c.id);
                        return { ...c, replies };
                    })
                );
                setComments(commentsWithReplies as Comment[]);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [postId]);

    // Check repost & bookmark status
    useEffect(() => {
        if (user && post) {
            hasUserReposted(post.id, user.uid).then(setReposted);
            setRepostCount(post.repostCount || 0);
            if (post.isArticle) {
                isArticleSaved(user.uid, post.id).then(setBookmarked);
            }
        }
    }, [user, post]);

    // Load liked comments
    useEffect(() => {
        if (user && comments.length > 0) {
            const allCommentIds: string[] = [];
            comments.forEach(c => {
                allCommentIds.push(c.id);
                ((c as any).replies || []).forEach((r: Comment) => allCommentIds.push(r.id));
            });
            getBatchUserLikes(allCommentIds, user.uid).then(setLikedComments);
        }
    }, [user, comments]);

    // Handle Content Scan
    const handleScan = async () => {
        if (!user || !post) {
            toast.error('Please sign in to scan');
            return;
        }
        setIsScanning(true);
        try {
            const commentTexts = comments.map(c => c.content);
            const response = await fetch('/api/user/scan-content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.uid,
                    'x-user-email': user.email || '',
                },
                body: JSON.stringify({
                    content: post.content,
                    comments: commentTexts,
                    title: post.title
                }),
            });

            if (!response.ok) throw new Error('Scan failed');

            const data = await response.json();
            if (data.phrases && Array.isArray(data.phrases)) {
                // Add phrases to session vocab
                data.phrases.forEach((p: any) => {
                    addVocabWithData({
                        phrase: p.phrase,
                        meaning: p.meaning,
                        example: p.context,
                        sentenceTranslation: '', // AI didn't provide this, keep empty
                        register: 'consultative',
                        nuance: 'neutral',
                        topic: p.topic || 'general', // Use the specific topic from AI
                        subtopic: p.subtopic || 'general', // Use the semantic subtopic (e.g. Price, Negotiation)
                        // Note: We might want to store 'type' (idiom/collocation) somewhere else if needed, 
                        // but for now user requested subtopic to be semantic.
                        isHighFrequency: false,
                        commonUsages: [],
                    }, p.context);
                });

                toast.success(`Found ${data.phrases.length} vocabulary items!`);
                setSidebarExpanded(true);
            }
        } catch (error) {
            console.error('Scan error:', error);
            toast.error('Failed to scan content');
        } finally {
            setIsScanning(false);
        }
    };

    // Handle Extract Vocabulary (merged - extracts topic-specific vocab)
    const handleExtractVocab = async () => {
        if (!post) return;
        setIsExtractingVocab(true);
        try {
            const response = await fetch('/api/admin/extract-topic-vocab', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    content: post.content,
                    title: post.title,
                    detectedTopic: post.title, // Use title as topic hint
                }),
            });

            if (!response.ok) throw new Error('Extraction failed');

            const data = await response.json();
            if (data.topicVocab && data.topicVocab.length > 0) {
                // Build update object with vocab and optionally lexile
                const updateData: Record<string, unknown> = { topicVocab: data.topicVocab };

                // Add Lexile data if available
                if (data.lexile) {
                    updateData.lexileLevel = data.lexile.level;
                    updateData.lexileScore = data.lexile.score;
                }

                // Update post document with topic vocab and lexile
                await updatePost(post.id, updateData);
                setPost(prev => prev ? {
                    ...prev,
                    topicVocab: data.topicVocab,
                    ...(data.lexile && {
                        lexileLevel: data.lexile.level,
                        lexileScore: data.lexile.score
                    })
                } : prev);

                const lexileInfo = data.lexile ? ` (${data.lexile.level} - Lexile ${data.lexile.score})` : '';
                toast.success(`Extracted ${data.topicVocab.length} words${lexileInfo}`);
            } else {
                toast.info('No topic vocabulary found');
            }
        } catch (error) {
            console.error('Topic vocab error:', error);
            toast.error('Failed to extract topic vocabulary');
        } finally {
            setIsExtractingVocab(false);
        }
    };

    // Handle Generate Audio
    const handleGenerateAudio = async () => {
        if (!post) return;

        // Check if audio already exists
        if (post.audioUrl) {
            toast.info('Audio already generated for this article');
            return;
        }

        setIsGeneratingAudio(true);
        try {
            const response = await fetch('/api/admin/generate-article-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    content: post.content,
                    title: post.title,
                }),
            });

            if (!response.ok) throw new Error('Audio generation failed');

            const data = await response.json();
            if (data.audioBase64) {
                // Convert base64 to raw PCM bytes
                const byteCharacters = atob(data.audioBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const pcmData = new Uint8Array(byteNumbers);

                // Convert raw L16 PCM (24kHz) to WAV format for browser playback
                const sampleRate = 24000;
                const numChannels = 1;
                const bitsPerSample = 16;
                const wavHeader = new ArrayBuffer(44);
                const view = new DataView(wavHeader);

                // RIFF header
                view.setUint32(0, 0x46464952, true); // "RIFF"
                view.setUint32(4, 36 + pcmData.length, true); // file size
                view.setUint32(8, 0x45564157, true); // "WAVE"

                // fmt chunk
                view.setUint32(12, 0x20746d66, true); // "fmt "
                view.setUint32(16, 16, true); // chunk size
                view.setUint16(20, 1, true); // audio format (PCM)
                view.setUint16(22, numChannels, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // byte rate
                view.setUint16(32, numChannels * bitsPerSample / 8, true); // block align
                view.setUint16(34, bitsPerSample, true);

                // data chunk
                view.setUint32(36, 0x61746164, true); // "data"
                view.setUint32(40, pcmData.length, true);

                // Combine header and PCM data
                const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });

                // Upload to Firebase Storage
                const { initializeFirebase } = await import('@/lib/firebase');
                const { storage } = await initializeFirebase();

                if (!storage) {
                    throw new Error('Firebase Storage not available');
                }

                const { ref, uploadBytes, getDownloadURL } = await import('@/lib/firebase/storage');
                const audioRef = ref(storage, `audio/articles/${post.id}.wav`);

                toast.loading('Uploading audio...', { id: 'audio-upload' });
                await uploadBytes(audioRef, wavBlob);
                const audioUrl = await getDownloadURL(audioRef);
                toast.dismiss('audio-upload');

                // Save URL to Firestore
                const { Timestamp } = await import('@/lib/firebase/firestore');
                await updatePost(post.id, {
                    audioUrl,
                    audioGeneratedAt: Timestamp.now()
                });

                // Update local state
                setPost(prev => prev ? { ...prev, audioUrl } : prev);
                toast.success(`Audio generated! (~${Math.round(data.estimatedDurationSeconds / 60)} min)`);
            }
        } catch (error) {
            console.error('Audio generation error:', error);
            toast.dismiss('audio-upload');
            toast.error('Failed to generate audio');
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    const handleBookmark = async () => {
        if (!user || !post) return;
        setBookmarking(true);
        try {
            if (bookmarked) {
                await unsaveArticle(user.uid, post.id);
                setBookmarked(false);
                toast.info('Removed from saved');
            } else {
                await saveArticle(user.uid, post.id);
                setBookmarked(true);
                toast.success('Saved!');
            }
        } catch {
            toast.error('Failed to update');
        }
        setBookmarking(false);
    };

    const handleLikeComment = async (commentId: string) => {
        if (!user) return toast.error('Please sign in');
        const isLiked = likedComments.has(commentId);
        const newLiked = new Set(likedComments);
        isLiked ? newLiked.delete(commentId) : newLiked.add(commentId);
        setLikedComments(newLiked);
        setComments(comments.map(c => {
            if (c.id === commentId) return { ...c, likeCount: c.likeCount + (isLiked ? -1 : 1) };
            if ((c as any).replies) {
                return {
                    ...c, replies: ((c as any).replies || []).map((r: Comment) =>
                        r.id === commentId ? { ...r, likeCount: r.likeCount + (isLiked ? -1 : 1) } : r
                    )
                } as any;
            }
            return c;
        }));
        try { await likeComment(commentId, user.uid); } catch { setLikedComments(likedComments); }
    };

    const handleSubmitComment = async () => {
        if (!user || !comment.trim() || !profile || !post) return;
        setSubmitting(true);
        try {
            await addComment(post.id, user.uid, profile.displayName || 'User', profile.username || 'user', profile.photoURL, comment);
            setComment('');
            const newComments = await getComments(post.id);
            setComments(newComments);
        } catch (e) { console.error(e); }
        setSubmitting(false);
    };

    const handleRepost = async () => {
        if (!user || !post) return;
        try {
            await repostPost(post.id, user.uid);
            setReposted(!reposted);
            setRepostCount(prev => reposted ? prev - 1 : prev + 1);
        } catch (e) { console.error(e); }
    };

    const handleSubmitReply = async (parentId: string) => {
        if (!user || !replyText.trim() || !profile || !post) return;
        try {
            await addComment(post.id, user.uid, profile.displayName || 'User', profile.username || 'user', profile.photoURL, replyText, parentId);
            setReplyText('');
            setReplyingTo(null);
            const newComments = await getComments(post.id);
            const commentsWithReplies = await Promise.all(newComments.map(async (c) => ({ ...c, replies: await getReplies(c.id) })));
            setComments(commentsWithReplies as Comment[]);
        } catch (e) { console.error(e); }
    };

    const getTotalCommentCount = () => comments.reduce((t, c) => t + 1 + ((c as any).replies?.length || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!post) {
        return (
            <div className="max-w-2xl mx-auto py-24 px-6 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                    <span className="text-4xl">👻</span>
                </div>
                <h2
                    className="text-2xl font-normal text-neutral-900 mb-3"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    This article seems to have vanished
                </h2>
                <p className="text-neutral-500 text-sm mb-8 leading-relaxed">
                    The post you are looking for has been deleted or is no longer available. Don't worry, there's plenty more to read.
                </p>
                <div className="flex flex-col w-full max-w-sm gap-3 mx-auto">
                    <button
                        onClick={() => window.location.href = '/'}
                        className="w-full bg-neutral-900 text-white px-6 py-3.5 text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                    >
                        Read Fresh Articles
                        <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => window.location.href = '/practice'}
                        className="w-full text-neutral-400 px-6 py-3 text-xs font-medium uppercase tracking-[0.08em] hover:text-neutral-600 transition-colors"
                    >
                        Go to Practice Room
                    </button>
                </div>
            </div>
        );
    }

    // New: Check if article has sentence translations
    const hasSentences = post.sentences && post.sentences.length > 0;
    const readingTime = Math.max(1, Math.ceil(post.content.length / 1000));

    const formattedContent = () => {
        // Priority: lexileVersions > levels > original content
        let content = post.content;

        // Check for new lexileVersions format (easy/medium/hard)
        if (post.lexileVersions) {
            if (selectedLevel === 'A1' || selectedLevel === 'A2') {
                content = post.lexileVersions.easy || content;
            } else if (selectedLevel === 'B1') {
                content = post.lexileVersions.medium || content;
            } else if (selectedLevel === 'B2') {
                content = post.lexileVersions.hard || content;
            }
        }
        // Fallback to old levels format
        else if (post.levels?.[selectedLevel]?.content) {
            content = post.levels[selectedLevel]!.content;
        }

        if (!post.highlightedPhrases?.length && !post.topicVocab?.length) return content;
        let highlighted = content;

        // First, highlight topic vocab words (purple, with data attribute)
        if (post.topicVocab?.length) {
            post.topicVocab.forEach(vocabItem => {
                const escaped = vocabItem.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Purple style for topic vocab words
                const style = 'background: transparent; color: #9333ea; text-decoration: underline; text-decoration-style: dotted; cursor: pointer;';
                highlighted = highlighted.replace(
                    new RegExp(`\\b(${escaped})\\b`, 'gi'),
                    `<mark style="${style}" data-topic-vocab="${vocabItem.word.toLowerCase()}">$1</mark>`
                );
            });
        }

        // Then highlight regular phrases
        post.highlightedPhrases?.forEach(phrase => {
            // Skip if already highlighted as topic vocab
            const isTopicVocab = post.topicVocab?.some(v => v.word.toLowerCase() === phrase.toLowerCase());
            if (isTopicVocab) return;

            const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Check if this phrase is high-frequency (generic vocab)
            const phraseInfo = post.phraseData?.find(
                p => p.phrase.toLowerCase() === phrase.toLowerCase()
            );
            const isHighFreq = phraseInfo?.isHighFrequency || phraseInfo?.topic === 'high_frequency';

            // Topic-specific = blue color, High-frequency = no color (but clickable)
            const style = isHighFreq
                ? 'background: transparent; color: inherit; cursor: pointer;'  // Invisible but clickable
                : 'background: transparent; color: #2563eb;';  // Blue for topic-specific

            highlighted = highlighted.replace(
                new RegExp(`\\b(${escaped})\\b`, 'gi'),
                `<mark style="${style}">$1</mark>`
            );
        });
        return highlighted;
    };

    // Get current level's embedded questions
    const currentLevelQuestions = post.levels?.[selectedLevel]?.embeddedQuestions || [];

    // Handle question answer
    const handleQuestionAnswer = (questionId: string, isCorrect: boolean) => {
        setAnsweredQuestions(prev => new Set([...prev, questionId]));
    };

    // Find the next unanswered question to determine blur point
    const getNextUnansweredQuestionParagraph = () => {
        for (const q of currentLevelQuestions) {
            if (!answeredQuestions.has(q.id)) {
                return q.afterParagraph;
            }
        }
        return Infinity; // All questions answered, no blur
    };

    // Render content with embedded questions and blur effect
    const renderContentWithQuestions = () => {
        const content = formattedContent();
        const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
        const blurAfterParagraph = getNextUnansweredQuestionParagraph();

        return paragraphs.map((paragraph, index) => {
            const paragraphNumber = index + 1;
            const isBlurred = paragraphNumber > blurAfterParagraph;

            // Find question that should appear after this paragraph
            const questionForParagraph = currentLevelQuestions.find(
                q => q.afterParagraph === paragraphNumber && !answeredQuestions.has(q.id)
            );

            return (
                <div key={index}>
                    <div
                        className={cn(
                            'transition-all duration-300',
                            isBlurred && 'blur-sm select-none pointer-events-none'
                        )}
                        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(`<p>${paragraph}</p>`) }}
                    />

                    {questionForParagraph && (
                        <EmbeddedQuestionCard
                            question={questionForParagraph}
                            onAnswer={handleQuestionAnswer}
                            isAnswered={answeredQuestions.has(questionForParagraph.id)}
                        />
                    )}
                </div>
            );
        });
    };

    // Article View
    if (post.isArticle) {
        return (
            <>
                {DialogComponent}
                <ArticleReadingMode
                    post={post}
                    userId={user?.uid}
                    userEmail={user?.email || undefined}
                    isAdmin={user?.email === ADMIN_EMAIL}
                    onBookmark={handleBookmark}
                    bookmarked={bookmarked}
                    bookmarking={bookmarking}
                    audioUrl={post.audioUrl}
                    onGenerateAudio={handleGenerateAudio}
                    isGeneratingAudio={isGeneratingAudio}
                />
            </>
        );
    }

    // Regular Post View
    return (
        <TextHighlighter userId={user?.uid} userEmail={user?.email || undefined} userName={profile?.displayName} userUsername={profile?.username}>
            {DialogComponent}
            <div className="max-w-2xl mx-auto py-6 px-4">
                <Link href="/feed" className="inline-block mb-6">
                    <Button variant="ghost" size="sm" className="text-slate-500"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
                </Link>
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        {getSourceLogo(post.source) ? (
                            <img src={getSourceLogo(post.source)!} alt="" className="w-10 h-10 rounded-full object-contain bg-white p-1 border border-slate-100" />
                        ) : (
                            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm text-slate-400">
                                {post.authorUsername?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-400">@{post.authorUsername || 'user'}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-400">{toDateSafe(post.createdAt) ? formatTimeAgo(toDateSafe(post.createdAt)!) : 'Just now'}</span>
                        </div>
                    </div>
                    <div className="text-lg leading-relaxed whitespace-pre-wrap text-slate-800 mb-6" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(formattedContent()) }} />
                    <div className="flex items-center gap-6 py-4 border-t border-b border-slate-100 mb-6">
                        <button onClick={handleRepost} className={`flex items-center gap-2 text-sm font-medium ${reposted ? 'text-green-500' : 'text-slate-500 hover:text-green-500'}`}>
                            <Repeat2 className="h-4 w-4" />{reposted ? 'Reposted' : 'Repost'}{repostCount > 0 && ` (${repostCount})`}
                        </button>
                        <button className="flex items-center gap-2 text-slate-500 hover:text-blue-500 text-sm font-medium">
                            <MessageCircle className="h-4 w-4" />{getTotalCommentCount()} Comments
                        </button>
                    </div>
                </div>
            </div>
        </TextHighlighter>
    );
}
