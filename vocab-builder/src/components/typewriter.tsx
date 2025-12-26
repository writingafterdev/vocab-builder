"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface TypewriterProps {
    text: string;
    className?: string;
    delay?: number; // Delay before starting in seconds
    speed?: number; // Typing speed in ms per character
    showCursor?: boolean;
    hideCursorOnComplete?: boolean;
}

export function Typewriter({
    text,
    className = "",
    delay = 0,
    speed = 50,
    showCursor = true,
    hideCursorOnComplete = false,
}: TypewriterProps) {
    const [displayText, setDisplayText] = useState("");
    const [isStarted, setIsStarted] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const startTimeout = setTimeout(() => {
            setIsStarted(true);
        }, delay * 1000);

        return () => clearTimeout(startTimeout);
    }, [delay]);

    useEffect(() => {
        if (!isStarted) return;

        let currentIndex = 0;
        const interval = setInterval(() => {
            if (currentIndex < text.length) {
                setDisplayText(text.slice(0, currentIndex + 1));
                currentIndex++;
            } else {
                setIsComplete(true);
                clearInterval(interval);
            }
        }, speed);

        return () => clearInterval(interval);
    }, [isStarted, text, speed]);

    const shouldShowCursor = showCursor && isStarted && (!isComplete || !hideCursorOnComplete);

    return (
        <span className={className}>
            {displayText}
            {shouldShowCursor && (
                <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
                    className="inline-block ml-[1px] w-[2px] h-[0.9em] bg-current align-middle"
                />
            )}
        </span>
    );
}
