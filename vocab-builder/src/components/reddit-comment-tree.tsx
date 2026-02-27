'use client';

import { useState } from 'react';
import { RedditComment } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, MessageSquare, ArrowUp } from 'lucide-react';

interface RedditCommentTreeProps {
    comments: RedditComment[];
    onPhraseClick?: (phrase: string, context: string) => void;
    maxDepth?: number;
}

/**
 * Hierarchical Reddit comment tree component with modern styling
 */
export function RedditCommentTree({
    comments,
    onPhraseClick,
    maxDepth = 5,
}: RedditCommentTreeProps) {
    if (!comments || comments.length === 0) {
        return null;
    }

    return (
        <div className="mt-10 border-t border-slate-200 pt-8">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-orange-500" />
                </div>
                <span>Reddit Discussion</span>
                <span className="text-sm font-normal text-slate-400 ml-2">
                    ({comments.length} top comments)
                </span>
            </h3>
            <div className="space-y-4">
                {comments.map((comment) => (
                    <CommentNode
                        key={comment.id}
                        comment={comment}
                        depth={0}
                        maxDepth={maxDepth}
                        onPhraseClick={onPhraseClick}
                    />
                ))}
            </div>
        </div>
    );
}

interface CommentNodeProps {
    comment: RedditComment;
    depth: number;
    maxDepth: number;
    onPhraseClick?: (phrase: string, context: string) => void;
}

function CommentNode({ comment, depth, maxDepth, onPhraseClick }: CommentNodeProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const hasChildren = comment.children && comment.children.length > 0;
    const canShowChildren = depth < maxDepth;

    // Color based on depth for visual hierarchy
    const depthColors = [
        'border-blue-300',
        'border-purple-300',
        'border-green-300',
        'border-orange-300',
        'border-pink-300',
    ];
    const borderColor = depthColors[depth % depthColors.length];

    // Generate avatar initials
    const initials = comment.author.slice(0, 2).toUpperCase();
    const avatarColors = [
        'bg-blue-500',
        'bg-purple-500',
        'bg-green-500',
        'bg-orange-500',
        'bg-pink-500',
        'bg-teal-500',
    ];
    const avatarColor = avatarColors[comment.author.charCodeAt(0) % avatarColors.length];

    return (
        <div
            className={cn(
                'relative',
                depth > 0 && `ml-4 pl-4 border-l-2 ${borderColor}`
            )}
        >
            {/* Comment card */}
            <div className={cn(
                "rounded-xl transition-colors",
                depth === 0 ? "bg-slate-50 p-4" : "py-3"
            )}>
                {/* Header */}
                <div className="flex items-center gap-3 mb-2">
                    {/* Avatar */}
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                        avatarColor
                    )}>
                        {initials}
                    </div>

                    {/* Username and points */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">
                            {comment.author}
                        </span>
                        <div className="flex items-center gap-1 text-slate-500 text-sm">
                            <ArrowUp className="w-3.5 h-3.5" />
                            <span>{comment.upvotes} points</span>
                        </div>
                    </div>

                    {/* Collapse button */}
                    {hasChildren && canShowChildren && (
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="ml-auto p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"
                        >
                            {isCollapsed ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronUp className="w-4 h-4" />
                            )}
                        </button>
                    )}
                </div>

                {/* Comment body */}
                {!isCollapsed && (
                    <div
                        className="text-slate-700 text-[15px] leading-relaxed pl-11 article-clickable-text"
                        onClick={(e) => {
                            if (onPhraseClick) {
                                const target = e.target as HTMLElement;
                                if (target.tagName === 'MARK') {
                                    e.stopPropagation();
                                    const phrase = target.textContent || '';
                                    onPhraseClick(phrase, comment.body);
                                }
                            }
                        }}
                        dangerouslySetInnerHTML={{
                            __html: comment.bodyHtml || formatCommentBody(comment.body),
                        }}
                    />
                )}
            </div>

            {/* Nested replies */}
            {hasChildren && canShowChildren && !isCollapsed && (
                <div className="mt-2 space-y-2">
                    {comment.children.map((child) => (
                        <CommentNode
                            key={child.id}
                            comment={child}
                            depth={depth + 1}
                            maxDepth={maxDepth}
                            onPhraseClick={onPhraseClick}
                        />
                    ))}
                </div>
            )}

            {/* Show more indicator */}
            {hasChildren && !canShowChildren && (
                <div className="mt-3 pl-11">
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        View {countNestedComments(comment.children)} more replies
                    </button>
                </div>
            )}

            {/* Collapsed indicator */}
            {isCollapsed && hasChildren && (
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="mt-1 pl-11 text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                    Show {1 + countNestedComments(comment.children)} replies
                </button>
            )}
        </div>
    );
}

/**
 * Format plain text comment body for display
 */
function formatCommentBody(body: string): string {
    return body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p class="mt-3">')
        .replace(/\n/g, '<br />')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
}

/**
 * Count total nested comments
 */
function countNestedComments(comments: RedditComment[]): number {
    let count = 0;
    for (const comment of comments) {
        count += 1 + countNestedComments(comment.children);
    }
    return count;
}
