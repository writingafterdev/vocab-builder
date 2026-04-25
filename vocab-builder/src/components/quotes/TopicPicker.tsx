'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

type LearningGoal = 'natural_english' | 'beautiful_english';

const LEARNING_GOALS: Array<{
    id: LearningGoal;
    title: string;
    description: string;
}> = [
    {
        id: 'natural_english',
        title: 'Be more natural in English',
        description: 'Read, notice, and practice phrases that make your English feel fluent in context.',
    },
    {
        id: 'beautiful_english',
        title: 'Use English more beautifully',
        description: 'Build a sharper, more literary vocabulary with uncommon words and elegant usage.',
    },
];

const FEED_TOPICS = [
    { id: 'technology', label: 'Technology' },
    { id: 'science', label: 'Science' },
    { id: 'business', label: 'Business' },
    { id: 'psychology', label: 'Psychology' },
    { id: 'culture', label: 'Culture' },
    { id: 'philosophy', label: 'Philosophy' },
    { id: 'world', label: 'World' },
    { id: 'health', label: 'Health' },
] as const;

interface TopicPickerProps {
    userId: string;
    onComplete: () => void;
}

export function TopicPicker({ userId, onComplete }: TopicPickerProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [learningGoal, setLearningGoal] = useState<LearningGoal | null>(null);
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
        if (selected.size < 3 || !learningGoal) return;
        setSaving(true);

        try {
            const res = await fetch('/api/quotes/topic-picker', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ topics: Array.from(selected), learningGoal }),
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

    const canSubmit = selected.size >= 3 && Boolean(learningGoal);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-6"
        >
            <div className="text-center mb-12">
                <h2
                    className="text-[48px] md:text-[56px] font-normal text-neutral-900 leading-none tracking-tight mb-4"
                    style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                >
                    What kind of English do you want?
                </h2>
                <p className="text-sm text-neutral-400 tracking-[0.08em] uppercase">
                    Choose your goal, then pick at least 3 topics.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full mb-12">
                {LEARNING_GOALS.map((goal) => {
                    const isSelected = learningGoal === goal.id;
                    return (
                        <button
                            key={goal.id}
                            onClick={() => setLearningGoal(goal.id)}
                            className={`text-left p-6 border transition-all duration-200 bg-white ${
                                isSelected
                                    ? 'border-neutral-900 shadow-[8px_8px_0_rgba(0,0,0,0.08)]'
                                    : 'border-neutral-200 hover:border-neutral-400'
                            }`}
                        >
                            <span className="block text-[11px] uppercase tracking-[0.16em] text-neutral-400 mb-3">
                                {goal.id === 'beautiful_english' ? 'Elevated vocabulary' : 'Natural fluency'}
                            </span>
                            <span
                                className="block text-2xl md:text-3xl text-neutral-900 leading-tight mb-3"
                                style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                            >
                                {goal.title}
                            </span>
                            <span className="block text-sm leading-6 text-neutral-500">
                                {goal.description}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 max-w-2xl mx-auto mb-16">
                {FEED_TOPICS.map((topic) => {
                    const isSelected = selected.has(topic.id);
                    return (
                        <button
                            key={topic.id}
                            onClick={() => toggle(topic.id)}
                            className={`px-2 py-2 text-lg md:text-xl font-medium whitespace-nowrap border-b-[3px] transition-colors duration-200 ${
                                isSelected
                                    ? 'border-neutral-900 text-neutral-900'
                                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                            }`}
                            style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
                        >
                            {topic.label}
                        </button>
                    );
                })}
            </div>

            {/* Counter + Submit */}
            <div className="flex flex-col items-center gap-4 mt-8">
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 uppercase tracking-[0.1em] font-medium">
                    <span className="text-neutral-900 font-bold">{selected.size}</span> selected
                    <span className="text-neutral-200">|</span>
                    <span>{!learningGoal ? 'Pick a goal' : selected.size < 3 ? `${3 - selected.size} more to go` : 'Ready to start'}</span>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || saving}
                    className={`
                        px-8 py-3.5 text-[11px] font-bold uppercase tracking-[0.15em]
                        transition-all duration-300 border
                        ${canSubmit
                            ? 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800'
                            : 'bg-transparent text-neutral-300 border-neutral-200 cursor-not-allowed'
                        }
                    `}
                >
                    {saving ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Saving...
                        </span>
                    ) : (
                        'Start Exploring'
                    )}
                </button>
            </div>
        </motion.div>
    );
}
