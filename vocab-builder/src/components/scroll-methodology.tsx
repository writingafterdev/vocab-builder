"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const steps = [
    {
        title: "You read",
        subtitle: "Curated articles. Real context.",
        color: "#1a1a1a", // Dark background
        text: "#fdfcfb",  // Light text
        accent: "#A69F98" // Warm Taupe
    },
    {
        title: "You learn",
        subtitle: "Register. Tone. Nuance.",
        color: "#fdfcfb", // Light background
        text: "#1a1a1a",  // Dark text
        accent: "#7A8B8B" // Muted Sage/Steel
    },
    {
        title: "You write",
        subtitle: "Active recall. Better flow.",
        color: "#1a1a1a",
        text: "#fdfcfb",
        accent: "#C4B8A5" // Sand/Linen
    },
    {
        title: "You earn",
        subtitle: "Mastery serves your craft.",
        color: "#fdfcfb",
        text: "#1a1a1a",
        accent: "#6B6B6B" // Cool Gray
    }
];

export function ScrollMethodology() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    return (
        <div ref={containerRef} className="relative h-[300vh]">
            <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center">
                {steps.map((step, index) => {
                    // Stacking Logic:
                    // Step 0 is the base (opacity 1).
                    // Subsquent steps fade in on top of the previous ones.

                    const isBase = index === 0;

                    // Triggers for Step 1, 2, 3
                    const startRange = index * 0.25;

                    // eslint-disable-next-line react-hooks/rules-of-hooks
                    const opacity = isBase
                        ? 1
                        : useTransform(
                            scrollYProgress,
                            [startRange - 0.1, startRange], // Fade in duration
                            [0, 1]
                        );

                    // Scale logic: Subtle zoom as it arrives? 
                    // Let's keep it simple: slight zoom in for active, zoom out when covered?
                    // Actually, just a gentle continuous movement is best.
                    // eslint-disable-next-line react-hooks/rules-of-hooks
                    const scale = useTransform(
                        scrollYProgress,
                        [0, 1],
                        [1, 1.1] // Slow continuous zoom for everything
                    );

                    return (
                        <motion.div
                            key={index}
                            style={{
                                opacity,
                                backgroundColor: step.color,
                                zIndex: index
                            }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 transition-colors duration-500"
                        >
                            <motion.h2
                                style={{ scale }}
                                className="text-6xl md:text-9xl font-serif font-medium mb-6"
                            >
                                <span style={{ color: step.text }}>{step.title.split(' ')[0]} </span>
                                <span style={{ color: step.accent, fontStyle: 'italic' }}>{step.title.split(' ')[1]}</span>
                            </motion.h2>
                            <motion.p
                                className="text-xl md:text-3xl font-light font-sans opacity-60"
                                style={{ color: step.text }}
                            >
                                {step.subtitle}
                            </motion.p>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
