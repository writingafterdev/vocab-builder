'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EditorialLoaderProps {
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

/**
 * Editorial loading animation — typographic and on-brand.
 * Three horizontal bars that stagger-animate like a text cursor/caret,
 * with an optional uppercase tracking label beneath.
 */
export function EditorialLoader({ label, size = 'md', className }: EditorialLoaderProps) {
    const barSizes = {
        sm: { w1: 'w-6', w2: 'w-4', w3: 'w-8', h: 'h-[2px]', gap: 'gap-1.5' },
        md: { w1: 'w-10', w2: 'w-6', w3: 'w-14', h: 'h-[2px]', gap: 'gap-2' },
        lg: { w1: 'w-14', w2: 'w-8', w3: 'w-20', h: 'h-[2px]', gap: 'gap-2.5' },
    };

    const textSizes = {
        sm: 'text-[9px]',
        md: 'text-[10px]',
        lg: 'text-[11px]',
    };

    const s = barSizes[size];

    return (
        <div className={cn("flex flex-col items-center justify-center", className)}>
            {/* Animated bars */}
            <div className={cn("flex flex-col items-center", s.gap)}>
                {[
                    { width: s.w1, delay: 0 },
                    { width: s.w3, delay: 0.3 },
                    { width: s.w2, delay: 0.6 },
                ].map((bar, i) => (
                    <motion.div
                        key={i}
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut' as const,
                            delay: bar.delay,
                        }}
                        style={{ transformOrigin: i % 2 === 0 ? 'left' : 'right' }}
                        className={cn(bar.width, s.h, "bg-neutral-900")}
                    />
                ))}
            </div>

            {/* Label */}
            {label && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
                    className={cn(
                        "mt-4 uppercase tracking-[0.25em] text-neutral-400 font-medium",
                        textSizes[size]
                    )}
                >
                    {label}
                </motion.p>
            )}
        </div>
    );
}
