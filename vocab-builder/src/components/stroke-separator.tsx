"use client";

import { useEffect, useState } from 'react';

type StrokeVariant = 'wave' | 'curve' | 'scribble' | 'extreme';

export default function StrokeSeparator({
    className = "",
    variant = 'wave',
    color = "currentColor"
}: {
    className?: string;
    variant?: StrokeVariant;
    color?: string;
}) {
    // We use a client-side only random seed to prevent hydration mismatch if we wanted random,
    // but for now we'll stick to explicit variants passed by props or default.

    // For 'extreme' variant, we want a taller viewbox to accommodate the large waves
    const isExtreme = variant === 'extreme';
    const viewBox = isExtreme ? "0 0 1200 120" : "0 0 1200 48";
    const heightClass = isExtreme ? "h-16 md:h-32" : "h-8 md:h-12";

    return (
        <div className={`w-full flex justify-center py-0 overflow-hidden leading-none ${className}`}>
            <svg
                viewBox={viewBox}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
                className={`w-full ${heightClass} transform`}
                style={{ color }}
            >
                <defs>
                    <filter id="rough-paper">
                        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
                    </filter>
                    <filter id="extreme-rough">
                        <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="4" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" />
                    </filter>
                </defs>

                {variant === 'wave' && (
                    <path
                        d="M0 24 C 150 48, 300 0, 450 24 C 600 48, 750 0, 900 24 C 1050 48, 1150 12, 1200 24"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        style={{ filter: 'url(#rough-paper)' }}
                    />
                )}

                {variant === 'curve' && (
                    <path
                        d="M0 34 C 200 10, 400 38, 600 24 C 800 10, 1000 38, 1200 14"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        fill="none"
                        style={{ filter: 'url(#rough-paper)' }}
                    />
                )}

                {variant === 'scribble' && (
                    <path
                        d="M0 24 Q 150 5, 300 24 T 600 24 T 900 24 T 1200 24"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray="10 10"
                        style={{ filter: 'url(#rough-paper)' }}
                    />
                )}

                {variant === 'extreme' && (
                    <path
                        d="M0,200 L0,60 Q150,20 300,50 T600,40 T900,80 T1200,40 L1200,200 Z"
                        fill="currentColor"
                        stroke="none"
                        style={{ filter: 'url(#extreme-rough)' }}
                    />
                )}
            </svg>
        </div>
    );
}
