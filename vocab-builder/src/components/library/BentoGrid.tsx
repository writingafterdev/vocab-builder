'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface BentoGridProps {
    children: ReactNode;
    className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
    return (
        <div
            className={cn(
                // 4-column grid with wider cards for image space
                'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(140px,auto)]',
                // Dense packing fills whitespace
                '[grid-auto-flow:dense]',
                className
            )}
        >
            {children}
        </div>
    );
}

export type CardSize = 'small' | 'medium' | 'large' | 'featured';

// Size to grid span mapping - wider spans for image space
const sizeToSpan: Record<CardSize, string> = {
    // Small: 1 col on desktop (compact but still readable)
    small: 'col-span-1 row-span-1',
    // Medium: 2 cols - standard width with room for image
    medium: 'col-span-1 md:col-span-2 row-span-1',
    // Large: 2 cols, 2 rows - prominent with big image space
    large: 'col-span-1 md:col-span-2 row-span-2',
    // Featured: full width on all screens
    featured: 'col-span-1 md:col-span-2 lg:col-span-4 row-span-1',
};

interface BentoCardProps {
    size?: CardSize;
    children: ReactNode;
    className?: string;
}

export function BentoCard({ size = 'small', children, className }: BentoCardProps) {
    return (
        <div className={cn(sizeToSpan[size], 'min-h-0', className)}>
            {children}
        </div>
    );
}

// Smart sizing based on source and content
export function getCardSize(post: {
    source?: string | null;
    wordCount?: number;
    coverImage?: string | null;
}): CardSize {
    const source = post.source?.toLowerCase() || '';
    const wordCount = post.wordCount || 0;
    const hasImage = !!post.coverImage;

    // Source-based sizing
    if (source.includes('reddit') || source.includes('twitter') || source.includes('x.com')) {
        return 'small';
    }
    if (source.includes('substack') || source.includes('medium.com')) {
        return hasImage ? 'large' : 'medium';
    }
    if (source.includes('epub') || source.includes('book') || source.includes('kindle')) {
        return 'featured';
    }
    if (source.includes('nytimes') || source.includes('guardian') || source.includes('bbc')) {
        return 'medium';
    }

    // Fallback by word count
    if (wordCount < 500) return 'small';
    if (wordCount < 1500) return 'medium';
    if (wordCount < 4000) return hasImage ? 'large' : 'medium';
    return 'large';
}

// Simple hash function to generate deterministic random number from string
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Random bento sizing - deterministic based on post ID for consistency
// but creates visual variety regardless of source or import order
export function getBentoPattern(index: number, totalPosts: number, postId?: string): CardSize {
    // First post is always featured
    if (index === 0) return 'featured';

    // Use post ID for deterministic randomness if available
    // Otherwise fall back to index-based pseudo-randomness
    const seed = postId ? hashCode(postId) : index * 7919; // 7919 is a prime for better distribution

    // Weighted distribution: more small/medium, fewer large
    // This creates a balanced grid with variety
    const rand = seed % 100;

    if (rand < 35) return 'small';      // 35% small
    if (rand < 70) return 'medium';     // 35% medium  
    if (rand < 90) return 'large';      // 20% large
    return 'medium';                     // 10% fallback to medium (instead of featured)
}
