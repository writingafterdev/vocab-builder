'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FEED_TOPICS = [
    { id: 'technology', label: 'Technology', emoji: '💻' },
    { id: 'science', label: 'Science', emoji: '🔬' },
    { id: 'business', label: 'Business', emoji: '💼' },
    { id: 'psychology', label: 'Psychology', emoji: '🧠' },
    { id: 'culture', label: 'Culture', emoji: '🏛' },
    { id: 'philosophy', label: 'Philosophy', emoji: '💭' },
    { id: 'world', label: 'World', emoji: '🌍' },
    { id: 'health', label: 'Health', emoji: '❤️‍🩹' },
] as const;

interface TopicPickerProps {
    userId: string;
    onComplete: () => void;
}

export function TopicPicker({ userId, onComplete }: TopicPickerProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    const toggle = (topicId: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(topicId)) {
                next.delete(topicId);
            } else {
                next.add(topicId);
            }
            return next;
        });
    };

    const handleSubmit = async () => {
        if (selected.size < 3) return;
        setSaving(true);

        try {
            const res = await fetch('/api/quotes/topic-picker', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ topics: Array.from(selected) }),
            });

            if (res.ok) {
                onComplete();
            }
        } catch (err) {
            console.error('Failed to save topics:', err);
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = selected.size >= 3;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-4"
        >
            {/* Header */}
            <div className="text-center mb-8">
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-neutral-900 inline-block mb-3">
                    Personalize
                </span>
                <h2
                    className="text-3xl font-normal text-neutral-900 mb-2 tracking-tight"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    What interests you?
                </h2>
                <p className="text-xs text-neutral-400 uppercase tracking-[0.1em]">
                    Pick at least 3 topics to personalize your feed
                </p>
            </div>

            {/* Topic Grid */}
            <div className="grid grid-cols-2 gap-px w-full max-w-sm mb-8 border border-neutral-200 bg-neutral-200">
                {FEED_TOPICS.map((topic) => {
                    const isSelected = selected.has(topic.id);

                    return (
                        <motion.button
                            key={topic.id}
                            onClick={() => toggle(topic.id)}
                            whileTap={{ scale: 0.97 }}
                            className={`
                                relative flex items-center gap-3 px-5 py-5
                                transition-all duration-200
                                ${isSelected
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                }
                            `}
                        >
                            <span className="text-xl">{topic.emoji}</span>
                            <span className="font-bold text-[11px] uppercase tracking-[0.08em]">{topic.label}</span>

                            {/* Checkmark */}
                            <AnimatePresence>
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="absolute top-2 right-2 w-5 h-5 bg-white flex items-center justify-center"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                            <path d="M2 6L5 9L10 3" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    );
                })}
            </div>

            {/* Counter + Submit */}
            <div className="flex flex-col items-center gap-3">
                <p className="text-[10px] text-neutral-400 uppercase tracking-[0.1em] font-bold">
                    {selected.size}/3 selected {selected.size < 3 ? `(${3 - selected.size} more)` : '✓'}
                </p>
                <motion.button
                    onClick={handleSubmit}
                    disabled={!canSubmit || saving}
                    whileTap={canSubmit ? { scale: 0.97 } : undefined}
                    className={`
                        px-8 py-3 font-bold text-[11px] uppercase tracking-[0.15em]
                        transition-all duration-200 border
                        ${canSubmit
                            ? 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800'
                            : 'bg-transparent text-neutral-300 border-neutral-200 cursor-not-allowed'
                        }
                    `}
                >
                    {saving ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Saving...
                        </span>
                    ) : (
                        'Start Exploring'
                    )}
                </motion.button>
            </div>
        </motion.div>
    );
}
