'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronDown, Zap, Loader2 } from 'lucide-react';

interface VocabPopupCardProps {
    phrase: string;
    meaning: string;
    register?: string | string[];
    nuance?: string | string[];
    context?: string;
    contextTranslation?: string;
    pronunciation?: string;
    topic?: string | string[];
    subtopic?: string | string[];
    isHighFrequency?: boolean;
    bounceKey?: number;
    onSave: () => void;
    onDismiss: () => void;
    isSaved?: boolean;
}

function toArray(v?: string | string[]): string[] {
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

function getNuanceColor(n: string): string {
    if (n.includes('positive')) return 'text-emerald-600';
    if (n.includes('negative')) return 'text-red-500';
    return 'text-neutral-500';
}

function getNuanceArrow(n: string): string {
    if (n.includes('positive')) return '↑';
    if (n.includes('negative')) return '↓';
    return '–';
}

export function VocabPopupCard({
    phrase,
    meaning,
    register,
    nuance,
    context,
    pronunciation,
    topic,
    subtopic,
    isHighFrequency,
    bounceKey = 0,
    onSave,
    onDismiss,
    isSaved,
}: VocabPopupCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [bounce, setBounce] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const registers = toArray(register);
    const nuances = toArray(nuance);
    const topics = toArray(topic);
    const subtopics = toArray(subtopic);
    const primarySubtopic = subtopics[0];
    const hasDetails = context || registers.length > 0 || nuances.length > 0 || topics.length > 0;

    // Reset expanded state when phrase changes
    useEffect(() => { setExpanded(false); }, [phrase]);

    // Re-lookup bounce
    useEffect(() => {
        if (bounceKey > 0) {
            setBounce(true);
            const timer = setTimeout(() => setBounce(false), 400);
            return () => clearTimeout(timer);
        }
    }, [bounceKey]);

    return (
        <motion.div
            key={phrase}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{
                opacity: 1,
                y: 0,
                scale: bounce ? [1, 1.02, 0.98, 1] : 1,
            }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{
                type: 'spring',
                stiffness: 300,
                damping: 26,
                ...(bounce ? { scale: { duration: 0.35 } } : {}),
            }}
            className="fixed bottom-[100px] md:bottom-6 left-4 right-4 md:left-auto md:right-6 z-40 w-auto md:w-[340px] bg-white border border-neutral-200 shadow-[0_8px_40px_rgba(0,0,0,0.12)] font-sans overflow-hidden"
        >
            {/* Header */}
            <div className="px-5 pt-4 pb-0 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                    <h3
                        className="text-xl font-normal text-neutral-900 italic leading-tight"
                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                    >
                        {phrase}
                    </h3>
                    {pronunciation && (
                        <span className="text-[11px] text-neutral-400 mt-0.5 block font-mono">
                            {pronunciation}
                        </span>
                    )}
                </div>
                <button
                    onClick={onDismiss}
                    className="p-1 -mt-0.5 -mr-1 text-neutral-300 hover:text-neutral-900 transition-colors flex-shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Meaning */}
            <div className="px-5 pt-2 pb-3">
                <p className="text-sm text-neutral-600 leading-relaxed">{meaning}</p>
            </div>

            {/* Expandable details */}
            {hasDetails && (
                <>
                    <button
                        onClick={() => setExpanded(prev => !prev)}
                        className="w-full flex items-center justify-center gap-1 py-2 border-t border-neutral-100 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors uppercase tracking-wider font-medium"
                    >
                        {expanded ? 'Less' : 'More details'}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                        {expanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                {/* Tags */}
                                {(registers.length > 0 || nuances.length > 0 || isHighFrequency) && (
                                    <div className="px-5 py-2 flex flex-wrap gap-1.5">
                                        {registers.map(r => (
                                            <span key={r} className="text-[9px] uppercase tracking-wider font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5">
                                                REG. {typeof r === 'string' ? r.toUpperCase() : ''}
                                            </span>
                                        ))}
                                        {nuances.map(n => (
                                            <span key={n} className={`text-[9px] uppercase tracking-wider font-bold bg-neutral-100 px-2 py-0.5 ${getNuanceColor(n)}`}>
                                                {getNuanceArrow(n)}{n.replace('slightly_', '').toUpperCase()}
                                            </span>
                                        ))}
                                        {isHighFrequency && (
                                            <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-bold text-amber-600 bg-amber-50 px-2 py-0.5">
                                                <Zap className="w-3 h-3 mr-0.5" />HIGH FREQ
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Context */}
                                {context && (
                                    <div className="px-5 py-2 border-t border-neutral-50">
                                        <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">Context</span>
                                        <p className="text-[13px] text-neutral-500 italic leading-relaxed">
                                            &ldquo;{context}&rdquo;
                                        </p>
                                    </div>
                                )}

                                {/* Topics */}
                                {topics.length > 0 && (
                                    <div className="px-5 py-2 flex flex-wrap gap-1.5">
                                        {topics.map((t, idx) => {
                                            if (typeof t !== 'string') return null;
                                            if (t === 'pending_ai') {
                                                return (
                                                    <span key={idx} className="text-[9px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5">
                                                        PENDING AI ANALYSIS
                                                    </span>
                                                );
                                            }
                                            return (
                                                <span key={idx} className="text-[9px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5">
                                                    {t.toUpperCase()}{idx === 0 && primarySubtopic && typeof primarySubtopic === 'string' ? ` / ${primarySubtopic.toUpperCase()}` : ''}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}

            {/* Save button */}
            <div className="px-4 pb-4 pt-1">
                <button
                    onClick={async () => {
                        if (isSaving || isSaved) return;
                        setIsSaving(true);
                        try {
                            await onSave();
                        } finally {
                            setIsSaving(false);
                        }
                    }}
                    disabled={isSaved || !meaning || isSaving}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition-all duration-200
                        ${isSaved
                            ? 'bg-neutral-100 text-neutral-400 cursor-default'
                            : (!meaning || isSaving)
                                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                : 'bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98]'
                        }`}
                >
                    {isSaving ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                    ) : isSaved ? (
                        <><Check className="w-3.5 h-3.5" /> Saved to Bank</>
                    ) : !meaning ? (
                        <>Analyzing...</>
                    ) : (
                        <>Add to Bank</>
                    )}
                </button>
            </div>
        </motion.div>
    );
}
