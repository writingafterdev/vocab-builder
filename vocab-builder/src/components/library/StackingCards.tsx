'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface StackingCardsProps {
    children: React.ReactNode;
    totalCards: number;
    scaleMultiplier?: number;
    className?: string;
}

export function StackingCards({
    children,
    totalCards,
    scaleMultiplier = 0.03,
    className = '',
}: StackingCardsProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {React.Children.map(children, (child, index) => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child as React.ReactElement<StackingCardItemProps>, {
                        index,
                        totalCards,
                        scaleMultiplier,
                        containerRef: containerRef as React.RefObject<HTMLDivElement>,
                    });
                }
                return child;
            })}
        </div>
    );
}

interface StackingCardItemProps {
    children: React.ReactNode;
    index?: number;
    totalCards?: number;
    scaleMultiplier?: number;
    containerRef?: React.RefObject<HTMLDivElement>;
    topOffset?: number;
    className?: string;
}

export function StackingCardItem({
    children,
    index = 0,
    totalCards = 1,
    scaleMultiplier = 0.03,
    containerRef,
    topOffset = 80, // Header height offset
    className = '',
}: StackingCardItemProps) {
    const cardRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: cardRef,
        offset: ['start start', 'end start'],
    });

    // Scale down slightly as the card scrolls up (gives stacking illusion)
    const scale = useTransform(
        scrollYProgress,
        [0, 1],
        [1, 1 - (totalCards - index) * scaleMultiplier]
    );

    // Add subtle shadow as cards stack
    const boxShadow = useTransform(
        scrollYProgress,
        [0, 0.5, 1],
        [
            '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
            '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
        ]
    );

    return (
        <div
            ref={cardRef}
            className={`sticky ${className}`}
            style={{ top: topOffset + index * 8 }} // Stack with offset
        >
            <motion.div
                style={{ scale, boxShadow }}
                className="origin-top"
            >
                {children}
            </motion.div>
        </div>
    );
}
