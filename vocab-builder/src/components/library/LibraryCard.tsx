'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LexileLevel } from '@/lib/db/types';
import { Timestamp } from '@/lib/firebase/firestore';
import { CardSize } from './BentoGrid';

export interface LibraryCardPost {
    id: string;
    title?: string | null;
    content: string;
    caption?: string | null;
    source?: string | null;
    coverImage?: string | null;
    authorName?: string | null;
    authorUsername?: string;
    createdAt?: Timestamp | Date | { _seconds: number } | { seconds: number } | string | number | null;
    progress?: number;
    phrasesCount?: number;
    isRead?: boolean;
    wordCount?: number;
    topics?: string[];
    levels?: Partial<Record<LexileLevel, unknown>>;
}

interface LibraryCardProps {
    post: LibraryCardPost;
    size?: CardSize;
    userLists?: Array<{ id: string; name: string; postIds: string[] }>;
    onAddToList?: (listId: string, postId: string) => void;
}

// Helper functions
const formatTime = (timestamp: LibraryCardPost['createdAt']) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp === 'object' && '_seconds' in timestamp) {
        date = new Date(timestamp._seconds * 1000);
    } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else {
        return 'Just now';
    }
    const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return `${Math.floor(hours / 24)}d ago`;
};

const decodeHtmlEntities = (text: string) => {
    return text
        // Decode numeric entities: &#123; and &#x1F; 
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        // Common named entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&lsquo;/g, '\u2018')
        .replace(/&rsquo;/g, '\u2019')
        .replace(/&ldquo;/g, '\u201C')
        .replace(/&rdquo;/g, '\u201D')
        .replace(/&hellip;/g, '…')
        .replace(/&nbsp;/g, ' ')
        .replace(/&reg;/g, '®')
        .replace(/&copy;/g, '©')
        .replace(/&trade;/g, '™');
};

const getReadTime = (wordCount: number) => {
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min read`;
};

const getRegisterLabel = (source?: string | null) => {
    const s = source?.toLowerCase() || '';
    if (s.includes('reddit') || s.includes('twitter') || s.includes('x.com')) {
        return 'Casual Register';
    }
    if (s.includes('nytimes') || s.includes('economist') || s.includes('bbc') || s.includes('substack') || s.includes('medium')) {
        return 'Formal Register';
    }
    return 'Casual Register';
};

// Source badge component
function SourceBadge({ source }: { source?: string | null }) {
    const displayName = source || 'Article';
    const s = source?.toLowerCase() || '';

    let bgClass = 'bg-neutral-200 text-neutral-800';
    if (s.includes('reddit')) bgClass = 'bg-orange-500 text-white';
    if (s.includes('medium')) bgClass = 'bg-neutral-900 text-white';
    if (s.includes('substack')) bgClass = 'bg-orange-600 text-white';
    if (s.includes('bbc')) bgClass = 'bg-red-600 text-white';
    if (s.includes('twitter') || s.includes('x.com')) bgClass = 'bg-neutral-900 text-white';

    return (
        <span className={cn("inline-flex items-center px-2.5 py-0.5 text-xs font-medium", bgClass)}>
            {displayName}
        </span>
    );
}

// Register badge component
function RegisterBadge({ source }: { source?: string | null }) {
    const label = getRegisterLabel(source);
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-neutral-200 text-xs text-neutral-500">
            <User className="h-3 w-3" />
            {label}
        </span>
    );
}

// SVG filter for true dithering effect (works with any image, no CORS issues)
const DitherFilter = () => (
    <svg className="absolute h-0 w-0">
        <defs>
            <filter id="dither-filter" x="0" y="0" width="100%" height="100%">
                {/* Convert to grayscale */}
                <feColorMatrix type="saturate" values="0" />
                {/* Increase contrast */}
                <feComponentTransfer>
                    <feFuncR type="linear" slope="1.5" intercept="-0.25" />
                    <feFuncG type="linear" slope="1.5" intercept="-0.25" />
                    <feFuncB type="linear" slope="1.5" intercept="-0.25" />
                </feComponentTransfer>
                {/* Add noise pattern for dithering */}
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
                {/* Posterize to create dither-like effect */}
                <feComponentTransfer>
                    <feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
                    <feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
                    <feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
                </feComponentTransfer>
            </filter>
        </defs>
    </svg>
);

// Preview image component with dithered effect for consistent branding
function PreviewImage({ src, size }: { src?: string | null; size: 'sm' | 'md' | 'lg' }) {
    const sizeClasses = {
        sm: 'w-16 h-16',
        md: 'w-24 h-24',
        lg: 'w-24 h-24',  // Square size, smaller for equal padding
    };

    return (
        <div className={cn(
            "overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-200 flex-shrink-0 flex items-center justify-center relative",
            sizeClasses[size]
        )}>
            <DitherFilter />
            {src ? (
                <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ filter: 'url(#dither-filter)' }}
                />
            ) : (
                <ImageIcon className="w-8 h-8 text-neutral-300" />
            )}
        </div>
    );
}

export function LibraryCard({ post, size = 'small' }: LibraryCardProps) {
    const router = useRouter();
    const progress = post.progress || 0;
    const wordCount = post.wordCount || Math.ceil(post.content.length / 5);
    const savedWords = post.phrasesCount || 0;

    const cleanContent = post.content.replace(/<[^>]*>?/gm, '');
    const previewLength = size === 'small' ? 80 : size === 'medium' ? 120 : 180;
    const previewText = decodeHtmlEntities(cleanContent.slice(0, previewLength)) + '...';

    const handleClick = () => router.push(`/post/${post.id}`);

    // Featured card - Full width with background image and text overlay
    if (size === 'featured') {
        // Generate accent color based on the source - using neutral/sophisticated palette
        const getAccentColor = () => {
            const s = post.source?.toLowerCase() || '';
            if (s.includes('reddit')) return { bg: 'bg-neutral-800', text: 'text-white' };
            if (s.includes('medium')) return { bg: 'bg-neutral-900', text: 'text-white' };
            if (s.includes('substack')) return { bg: 'bg-stone-800', text: 'text-white' };
            if (s.includes('bbc')) return { bg: 'bg-zinc-900', text: 'text-white' };
            if (s.includes('twitter') || s.includes('x.com')) return { bg: 'bg-slate-800', text: 'text-white' };
            if (s.includes('nytimes')) return { bg: 'bg-neutral-950', text: 'text-white' };
            // Default neutral/sophisticated colors matching webapp theme
            const colors = [
                { bg: 'bg-neutral-900', text: 'text-white' },
                { bg: 'bg-slate-800', text: 'text-white' },
                { bg: 'bg-zinc-800', text: 'text-white' },
                { bg: 'bg-stone-800', text: 'text-white' },
                { bg: 'bg-neutral-800', text: 'text-white' },
                { bg: 'bg-slate-900', text: 'text-white' },
            ];
            // Use post id to consistently pick a color
            const index = post.id?.charCodeAt(0) % colors.length || 0;
            return colors[index];
        };

        const accent = getAccentColor();

        return (
            <motion.article
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-[1.01]",
                    accent.bg
                )}
                onClick={handleClick}
                style={{ minHeight: '320px' }}
            >
                {/* Background Image with Mask */}
                {post.coverImage && (
                    <div className="absolute inset-0">
                        {/* Image positioned on the right side */}
                        <div className="absolute right-0 top-0 bottom-0 w-[55%]">
                            <img
                                src={post.coverImage}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {/* Gradient mask from left to right */}
                        <div
                            className={cn("absolute inset-0", accent.bg)}
                            style={{
                                maskImage: 'linear-gradient(to right, black 30%, black 45%, transparent 70%)',
                                WebkitMaskImage: 'linear-gradient(to right, black 30%, black 45%, transparent 70%)',
                            }}
                        />
                    </div>
                )}

                {/* Content Overlay */}
                <div className="relative z-10 h-full flex flex-col p-8 md:p-10">
                    {/* Source Badge - top, small and muted */}
                    <div className="flex items-center gap-2 mb-auto">
                        <span className="inline-flex items-center px-2 py-0.5 bg-white/15 backdrop-blur-sm text-white/80 text-[10px] font-medium uppercase tracking-wider">
                            {post.source || 'Article'}
                        </span>
                        <span className="text-white/50 text-[11px]">
                            {getReadTime(wordCount)}
                        </span>
                    </div>

                    {/* Main Content - positioned in lower half */}
                    <div className="mt-auto max-w-[55%]">
                        {/* Title - Dominant, largest element */}
                        <h2
                            className={cn(
                                "text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] mb-3",
                                accent.text
                            )}
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                        >
                            {post.title || 'Untitled'}
                        </h2>

                        {/* Description - subdued, supporting text */}
                        <p className={cn(
                            "text-sm md:text-base leading-relaxed line-clamp-2 opacity-60",
                            accent.text
                        )}>
                            {post.caption || previewText}
                        </p>

                        {/* Author/Stats Row - smallest tier */}
                        <div className="flex items-center gap-3 mt-5">
                            {post.authorName && (
                                <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 bg-white/15 flex items-center justify-center">
                                        <User className="w-3 h-3 text-white/70" />
                                    </div>
                                    <span className="text-white/70 text-xs">
                                        {post.authorName}
                                    </span>
                                </div>
                            )}
                            <span className="text-white/40 text-xs">
                                {formatTime(post.createdAt)}
                            </span>
                        </div>

                        {/* Progress indicator - minimal */}
                        {progress > 0 && (
                            <div className="mt-3 flex items-center gap-2">
                                <div className="flex-1 h-1 bg-white/15 overflow-hidden max-w-[160px]">
                                    <div
                                        className="h-full bg-white/80 transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <span className="text-white/50 text-[10px] font-medium">
                                    {progress}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Hover overlay for depth */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 pointer-events-none" />
            </motion.article>
        );
    }

    // Large card - 2 cols, 2 rows with medium image
    if (size === 'large') {
        return (
            <motion.article
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white p-4 border border-neutral-200 hover:shadow-md transition-all duration-200 flex flex-col h-full"
            >
                <div className="flex gap-4 flex-1">
                    <PreviewImage src={post.coverImage} size="md" />
                    <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <SourceBadge source={post.source} />
                                <span className="text-xs text-neutral-500">{formatTime(post.createdAt)}</span>
                            </div>
                            <RegisterBadge source={post.source} />
                        </div>
                        <h3
                            className="text-lg font-bold text-neutral-900 mb-2 leading-tight cursor-pointer hover:opacity-70 transition-opacity line-clamp-2"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            onClick={handleClick}
                        >
                            {post.title || 'Untitled'}
                        </h3>
                        <p className="text-sm text-neutral-600 mb-3 leading-relaxed line-clamp-3 flex-1">
                            {post.caption || previewText}
                        </p>
                        <div className="flex items-center justify-between mt-auto">
                            <div className="flex items-center gap-4 text-xs">
                                <div>
                                    <span className="text-neutral-400 uppercase text-[10px]">Progress</span>
                                    <p className="font-semibold text-neutral-900">{progress}%</p>
                                </div>
                                <div>
                                    <span className="text-neutral-400 uppercase text-[10px]">Saved</span>
                                    <p className="font-semibold text-neutral-900">{savedWords} words</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClick}
                                className="bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            </motion.article>
        );
    }

    // Medium card - 2 cols with small image
    if (size === 'medium') {
        return (
            <motion.article
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white p-4 border border-neutral-200 hover:shadow-md transition-all duration-200 h-full"
            >
                <div className="flex gap-4 h-full">
                    <PreviewImage src={post.coverImage} size="sm" />
                    <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <SourceBadge source={post.source} />
                                <span className="text-xs text-neutral-500">{formatTime(post.createdAt)}</span>
                            </div>
                            <RegisterBadge source={post.source} />
                        </div>
                        <h3
                            className="text-base font-bold text-neutral-900 mb-1 leading-snug cursor-pointer hover:opacity-70 transition-opacity line-clamp-2"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                            onClick={handleClick}
                        >
                            {post.title || 'Untitled'}
                        </h3>
                        <p className="text-sm text-neutral-600 mb-2 line-clamp-2 flex-1">
                            {post.caption || previewText}
                        </p>
                        <div className="text-xs text-neutral-500 mt-auto">
                            {savedWords} saved • ~{wordCount.toLocaleString()} words
                        </div>
                    </div>
                </div>
            </motion.article>
        );
    }

    // Small card (default) - compact, no image
    return (
        <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="group bg-white p-3 border border-neutral-200 hover:shadow-md transition-all duration-200 h-full"
        >
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                        <SourceBadge source={post.source} />
                        <span className="text-xs text-neutral-500">{formatTime(post.createdAt)}</span>
                    </div>
                </div>
                <h3
                    className="text-sm font-bold text-neutral-900 mb-1 leading-snug cursor-pointer hover:opacity-70 transition-opacity line-clamp-2"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                    onClick={handleClick}
                >
                    {post.title || 'Untitled'}
                </h3>
                <p className="text-xs text-neutral-600 line-clamp-2 mb-2 flex-1">
                    {previewText}
                </p>
                <div className="text-xs text-neutral-500 mt-auto">
                    {savedWords} saved • ~{(wordCount / 1000).toFixed(1)}k words
                </div>
            </div>
        </motion.article>
    );
}
