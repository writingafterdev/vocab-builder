'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
    Search,
    X,
    ChevronDown,
    Trash2,
    Edit3,
    Play,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { getUserPhrases, updateSavedPhrase } from '@/lib/db/srs';
import { useConfirm } from '@/components/confirm-dialog';
import { SpeakButton } from '@/hooks/use-text-to-speech';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import ImportVocabModal from '@/components/vocab/ImportVocabModal';

const VocabGraph = dynamic(() => import('@/components/vocab/vocab-graph'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-[500px] border border-neutral-100 bg-neutral-50/30">
            <EditorialLoader size="sm" />
        </div>
    )
});

// ─── Types ────────────────────────────────────────────
type TopicValue = string;

interface ChildExpression {
    id: string;
    type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
    phrase: string;
    baseForm: string;
    meaning: string;
    example?: string;
    context: string;
    sourceType: 'article' | 'exercise';
    topic: string;
    subtopic?: string;
    register: 'casual' | 'consultative' | 'formal';
    nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    learningStep: number;
    nextReviewDate: Date | null;
    lastReviewDate: Date | null;
    showCount: number;
    practiceCount: number;
    createdAt: Date;
}

interface Phrase {
    id: string;
    phrase: string;
    meaning: string;
    context: string;
    sourceTitle: string;
    createdAt: Date;
    showCount: number;
    practiceCount: number;
    nextShowAt: Date | null;
    retired: boolean;
    topics?: TopicValue[];
    topic?: string;
    subtopics?: string[];
    subtopic?: string;
    children?: ChildExpression[];
    register?: 'casual' | 'consultative' | 'formal';
    nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    isHighFrequency?: boolean;
    parentPhraseId?: string;
    childPhraseIds?: string[];
    source?: string;
    nextReviewDate?: string | null;
}

// ─── Helpers ──────────────────────────────────────────
function getStatus(showCount: number): 'new' | 'reviewing' | 'mastered' {
    if (showCount === 0) return 'new';
    if (showCount >= 6) return 'mastered';
    return 'reviewing';
}

function formatTopicLabel(topic: string | string[], subtopic?: string | string[]): string {
    const labels: Record<string, string> = { 
        daily_life: 'Daily Life', 
        high_frequency: 'High Frequency', 
        pending_ai: 'Pending AI Analysis',
        psychologymindset: 'Psychology / Mindset',
        foodlifestyle: 'Food / Lifestyle',
        healthfitness: 'Health / Fitness',
        educationlearning: 'Education / Learning',
        workcareer: 'Work / Career',
        relationshipssociallife: 'Relationships / Social Life',
        environmentnature: 'Environment / Nature',
        entertainmentmedia: 'Entertainment / Media',
        travelculture: 'Travel / Culture',
        moneyfinance: 'Money / Finance',
        communicationlanguage: 'Communication / Language',
        artcreativity: 'Art / Creativity',
        sportscompetition: 'Sports / Competition'
    };
    const topicStr = Array.isArray(topic) ? topic[0] : topic;
    const formattedTopic = topicStr ? (labels[topicStr] || topicStr.charAt(0).toUpperCase() + topicStr.slice(1).replace(/_/g, ' ')) : '';
    
    if (subtopic && topicStr !== 'pending_ai') {
        const subStr = Array.isArray(subtopic) ? subtopic[0] : subtopic;
        if (subStr) {
            const formattedSubtopic = labels[subStr] || subStr.charAt(0).toUpperCase() + subStr.slice(1).replace(/_/g, ' ');
            return `${formattedTopic} / ${formattedSubtopic}`;
        }
    }
    return formattedTopic;
}

function getTopicColor(topic: string): string {
    const colors: Record<string, string> = {
        business: 'bg-blue-600', career: 'bg-blue-600', finance: 'bg-emerald-600',
        academic: 'bg-violet-600', science: 'bg-violet-600', education: 'bg-violet-600',
        daily_life: 'bg-amber-600', relationships: 'bg-pink-600', family: 'bg-pink-600',
        travel: 'bg-cyan-600', entertainment: 'bg-rose-600', sports: 'bg-orange-600',
        technology: 'bg-slate-600', media: 'bg-fuchsia-600',
        health: 'bg-green-600', environment: 'bg-lime-600',
        politics: 'bg-red-600', culture: 'bg-purple-600',
        nature: 'bg-emerald-600', emotion: 'bg-pink-600', time: 'bg-slate-600',
        art: 'bg-amber-600', memory: 'bg-indigo-600', philosophy: 'bg-violet-600',
        experience: 'bg-teal-600', history: 'bg-stone-600', reflection: 'bg-sky-600',
        personal_growth: 'bg-emerald-600', lifestyle: 'bg-rose-600',
    };
    return colors[topic] || 'bg-neutral-600';
}

function getNuanceArrow(nuance?: string | string[]): { symbol: string; color: string } | null {
    if (!nuance) return null;
    const n = Array.isArray(nuance) ? nuance[0] : nuance;
    if (n?.includes('positive')) return { symbol: '↑', color: 'text-emerald-500' };
    if (n?.includes('negative')) return { symbol: '↓', color: 'text-red-400' };
    return null;
}

function getStatusStyle(status: 'new' | 'reviewing' | 'mastered') {
    switch (status) {
        case 'mastered': return 'bg-emerald-600 text-white';
        case 'reviewing': return 'bg-amber-500 text-white';
        default: return 'bg-neutral-200 text-neutral-500';
    }
}

// ─── Vocab Card ───────────────────────────────────────
function VocabCard({
    phrase,
    onOpenDetail,
    onDelete,
}: {
    phrase: Phrase;
    onOpenDetail: () => void;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const status = getStatus(phrase.showCount);
    const nuanceArrow = getNuanceArrow(phrase.nuance);
    const primaryTopic = phrase.topics?.[0] || phrase.topic;
    const childCount = phrase.children?.length || 0;

    // Import-specific: pending = future review date
    const isImported = phrase.source === 'import';
    const isPending = isImported && phrase.nextReviewDate && new Date(phrase.nextReviewDate) > new Date();
    const daysUntilDue = isPending && phrase.nextReviewDate
        ? Math.max(1, Math.ceil((new Date(phrase.nextReviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: isPending ? 0.4 : 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`group bg-white border-b border-r border-neutral-100 transition-all duration-200 ${isPending ? 'cursor-default' : 'hover:bg-neutral-50/50 cursor-pointer'}`}
            onClick={isPending ? undefined : onOpenDetail}
        >
            <div className="px-6 pt-6 pb-5">
                {/* Phrase + nuance arrow */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <h2
                            className="text-[28px] font-normal text-neutral-900 leading-tight tracking-tight"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                        >
                            {phrase.phrase}
                        </h2>
                        {nuanceArrow && (
                            <span className={`text-lg font-medium ${nuanceArrow.color} flex-shrink-0`}>
                                {nuanceArrow.symbol}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-300 hover:text-red-500 transition-all flex-shrink-0 mt-1"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {(() => {
                        const allTopics = phrase.topics?.length ? phrase.topics : (phrase.topic ? [phrase.topic] : []);
                        const primaryTopic = allTopics[0];
                        const extraTopicCount = allTopics.length - 1;
                        const allRegisters = phrase.register ? (Array.isArray(phrase.register) ? phrase.register : [phrase.register]).filter(Boolean) : [];
                        const primaryRegister = allRegisters[0];
                        return (
                            <>
                                {primaryTopic && (
                                    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white ${getTopicColor(primaryTopic)}`}>
                                        {formatTopicLabel(primaryTopic, phrase.subtopics?.[0] || (primaryTopic === phrase.topic ? phrase.subtopic : undefined))}
                                    </span>
                                )}
                                {extraTopicCount > 0 && (
                                    <span className="px-1.5 py-0.5 text-[10px] tracking-[0.05em] font-medium text-neutral-400 bg-neutral-100 rounded">
                                        +{extraTopicCount}
                                    </span>
                                )}
                                {primaryRegister && (
                                    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white ${primaryRegister === 'casual' ? 'bg-green-600' : primaryRegister === 'formal' ? 'bg-violet-600' : 'bg-blue-600'}`}>
                                        {primaryRegister}
                                    </span>
                                )}
                            </>
                        );
                    })()}
                    {isImported && (
                        <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white bg-indigo-600">
                            Imported
                        </span>
                    )}
                    {isPending ? (
                        <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-neutral-400 bg-neutral-100">
                            Due in {daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''}
                        </span>
                    ) : (
                        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold ${getStatusStyle(status)}`}>
                            {status === 'mastered' ? 'Mastered' : status === 'reviewing' ? 'Reviewing' : 'New'}
                        </span>
                    )}
                </div>

                {/* Meaning — italic serif */}
                <p
                    className="text-[15px] text-neutral-500 leading-relaxed italic"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    {phrase.meaning}
                </p>

                {/* Expandable examples */}
                {childCount > 0 && (
                    <div className="mt-4">
                        <button
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                            className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
                        >
                            See {childCount} examples
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
                                    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                                        {phrase.children?.map((child, idx) => (
                                            <div key={child.id || idx} className="flex items-start gap-2">
                                                <span className="text-neutral-300 text-xs mt-0.5">↳</span>
                                                <div>
                                                    <span className="text-sm font-medium text-neutral-800">{child.phrase}</span>
                                                    <span className="text-xs text-neutral-400 ml-2">{child.type?.replace('_', ' ')}</span>
                                                    <p className="text-xs text-neutral-500 mt-0.5">{child.meaning}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ─── Detail Modal ─────────────────────────────────────
function DetailModal({
    phrase,
    onClose,
    onUpdate,
    availableTopics = [],
}: {
    phrase: Phrase;
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<Phrase>) => void;
    availableTopics?: { value: string; label: string }[];
}) {
    const status = getStatus(phrase.showCount);
    const nuanceArrow = getNuanceArrow(phrase.nuance);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editMeaning, setEditMeaning] = useState(phrase.meaning);
    const [editRegister, setEditRegister] = useState<string>(
        Array.isArray(phrase.register) ? phrase.register[0] || 'consultative' : phrase.register || 'consultative'
    );
    const [editNuance, setEditNuance] = useState<string>(
        Array.isArray(phrase.nuance) ? phrase.nuance[0] || 'neutral' : phrase.nuance || 'neutral'
    );
    const [editTopics, setEditTopics] = useState<TopicValue[]>(phrase.topics?.length ? phrase.topics : (phrase.topic ? [phrase.topic] : []));

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateSavedPhrase(phrase.id, {
                meaning: editMeaning,
                register: editRegister as 'casual' | 'consultative' | 'formal',
                nuance: editNuance as 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative',
                topics: editTopics,
            });
            onUpdate(phrase.id, {
                meaning: editMeaning,
                register: editRegister as Phrase['register'],
                nuance: editNuance as Phrase['nuance'],
                topics: editTopics,
            });
            setIsEditing(false);
            toast.success('Saved');
        } catch {
            toast.error('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditMeaning(phrase.meaning);
        setEditRegister(Array.isArray(phrase.register) ? phrase.register[0] || 'consultative' : phrase.register || 'consultative');
        setEditNuance(Array.isArray(phrase.nuance) ? phrase.nuance[0] || 'neutral' : phrase.nuance || 'neutral');
        setEditTopics(phrase.topics?.length ? phrase.topics : (phrase.topic ? [phrase.topic] : []));
        setIsEditing(false);
    };

    const toggleTopic = (topic: TopicValue) => {
        setEditTopics(prev =>
            prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
        );
    };

    return (
        <div className="fixed inset-0 z-[100]" role="dialog">
            <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4" onClick={onClose}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        className="relative w-full max-w-lg bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-8 pt-8 pb-0 flex items-start justify-between">
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <h2
                                        className="text-3xl font-normal text-neutral-900 tracking-tight"
                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                    >
                                        {phrase.phrase}
                                    </h2>
                                    {nuanceArrow && (
                                        <span className={`text-xl ${nuanceArrow.color}`}>{nuanceArrow.symbol}</span>
                                    )}
                                    <SpeakButton text={phrase.phrase} />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className={`px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold ${getStatusStyle(status)}`}>
                                        {status === 'mastered' ? 'Mastered' : status === 'reviewing' ? 'Reviewing' : 'New'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {!isEditing ? (
                                    <button onClick={() => setIsEditing(true)} className="p-2 text-neutral-300 hover:text-neutral-900 transition-colors">
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={handleCancel} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-700">Cancel</button>
                                        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs bg-neutral-900 text-white font-medium disabled:opacity-50">
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </>
                                )}
                                <button onClick={onClose} className="p-2 text-neutral-300 hover:text-neutral-900 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-8 pt-6 pb-8 max-h-[70vh] overflow-y-auto space-y-6">
                            {/* Definition */}
                            <div>
                                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">Definition</label>
                                {isEditing ? (
                                    <textarea
                                        value={editMeaning}
                                        onChange={(e) => setEditMeaning(e.target.value)}
                                        className="w-full p-3 border border-neutral-200 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-none"
                                        rows={3}
                                    />
                                ) : (
                                    <p className="text-[15px] text-neutral-800 leading-relaxed bg-amber-50/60 px-4 py-3 border-l-[3px] border-amber-300/70 rounded-r" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                        {phrase.meaning}
                                    </p>
                                )}
                            </div>

                            {/* Register */}
                            <div>
                                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">Register</label>
                                {isEditing ? (
                                    <div className="flex gap-2">
                                        {(['casual', 'consultative', 'formal'] as const).map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setEditRegister(r)}
                                                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${editRegister === r
                                                    ? r === 'casual' ? 'bg-green-600 text-white'
                                                        : r === 'formal' ? 'bg-violet-600 text-white'
                                                            : 'bg-blue-600 text-white'
                                                    : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                                                    }`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {(Array.isArray(phrase.register) ? phrase.register : [phrase.register || 'consultative']).filter(Boolean).map((r, i) => (
                                            <span key={i} className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] font-bold text-white ${r === 'casual' ? 'bg-green-600' : r === 'formal' ? 'bg-violet-600' : 'bg-blue-600'
                                                }`}>
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Nuance */}
                            <div>
                                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">Nuance</label>
                                {isEditing ? (
                                    <div className="flex flex-wrap gap-2">
                                        {(['positive', 'slightly_positive', 'neutral', 'slightly_negative', 'negative'] as const).map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setEditNuance(n)}
                                                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${editNuance === n
                                                    ? n === 'positive' ? 'bg-emerald-600 text-white'
                                                        : n === 'slightly_positive' ? 'bg-lime-600 text-white'
                                                            : n === 'negative' ? 'bg-red-600 text-white'
                                                                : n === 'slightly_negative' ? 'bg-orange-500 text-white'
                                                                    : 'bg-neutral-600 text-white'
                                                    : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                                                    }`}
                                            >
                                                {n === 'positive' ? '↑ ' : n === 'slightly_positive' ? '↑ ' : n === 'negative' ? '↓ ' : n === 'slightly_negative' ? '↓ ' : '– '}
                                                {n.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {(Array.isArray(phrase.nuance) ? phrase.nuance : [phrase.nuance || 'neutral']).filter(Boolean).map((n, i) => {
                                            const arrow = n.includes('positive') ? '↑' : n.includes('negative') ? '↓' : '–';
                                            const bg = n === 'positive' ? 'bg-emerald-600'
                                                : n === 'slightly_positive' ? 'bg-lime-600'
                                                    : n === 'negative' ? 'bg-red-600'
                                                        : n === 'slightly_negative' ? 'bg-orange-500'
                                                            : 'bg-neutral-500';
                                            return (
                                                <span key={i} className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] font-bold text-white ${bg}`}>
                                                    {arrow} {n.replace(/_/g, ' ')}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Topics */}
                            <div>
                                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">Topics</label>
                                {isEditing ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {availableTopics.map(t => (
                                            <button
                                                key={t.value}
                                                onClick={() => toggleTopic(t.value)}
                                                className={`px-2.5 py-1 text-xs font-medium transition-colors ${editTopics.includes(t.value)
                                                    ? `text-white ${getTopicColor(t.value)}` : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                                                    }`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {(phrase.topics?.length ? phrase.topics : (phrase.topic ? [phrase.topic] : [])).length > 0 ? (phrase.topics?.length ? phrase.topics : [phrase.topic!]).map((t, idx) => (
                                            <span key={t} className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] font-bold text-white ${getTopicColor(t)}`}>
                                                {formatTopicLabel(t, phrase.subtopics?.[idx] || (t === phrase.topic ? phrase.subtopic : undefined))}
                                            </span>
                                        )) : <span className="text-sm text-neutral-400 italic">No topics</span>}
                                    </div>
                                )}
                            </div>

                            {/* Context */}
                            {phrase.context && (
                                <div>
                                    <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">Context</label>
                                    <p className="text-[13px] text-neutral-400 italic leading-relaxed border-l-2 border-neutral-200 pl-4">
                                        &ldquo;{phrase.context}&rdquo;
                                    </p>
                                </div>
                            )}

                            {/* Children */}
                            {phrase.children && phrase.children.length > 0 && (
                                <div>
                                    <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-2">
                                        Related Expressions ({phrase.children.length})
                                    </label>
                                    <div className="space-y-2">
                                        {phrase.children.map((child, idx) => (
                                            <div key={child.id || idx} className="bg-neutral-50 px-4 py-3 border border-neutral-100">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium text-neutral-800">{child.phrase}</span>
                                                    <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold bg-neutral-100 px-1.5 py-0.5">
                                                        {child.type?.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-neutral-500">{child.meaning}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Stats footer */}
                            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
                                <span>Added {new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(phrase.createdAt)}</span>
                                <span>Reviewed {phrase.showCount} times</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────
export default function VocabBankPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [phrases, setPhrases] = useState<Phrase[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeView, setActiveView] = useState('all');
    const [showImportModal, setShowImportModal] = useState(false);
    const [isGraphView, setIsGraphView] = useState(false);
    const [selectedPhrase, setSelectedPhrase] = useState<Phrase | null>(null);

    const { confirm, DialogComponent } = useConfirm();

    // Auth bounce
    useEffect(() => {
        if (!authLoading && !user) {
            toast('Please log in to view your Vocab Bank', {
                icon: '🔒',
                description: 'We need to know who you are to show your saved words.',
            });
            router.push('/auth/login');
        }
    }, [user, authLoading, router]);

    // Load phrases
    useEffect(() => {
        const loadPhrases = async () => {
            if (!user?.$id) {
                if (!authLoading) setLoading(false);
                return;
            }
            try {
                const savedPhrases = await getUserPhrases(user.$id);
                const visiblePhrases = savedPhrases.filter(sp => {
                    const hasParent = !!(sp as any).parentPhraseId;
                    const hasAppeared = (sp as any).hasAppearedInExercise === true;
                    return !hasParent || hasAppeared;
                });

                const displayPhrases: Phrase[] = visiblePhrases.map(sp => ({
                    id: sp.id,
                    phrase: sp.phrase,
                    meaning: sp.meaning,
                    context: sp.context,
                    sourceTitle: 'Saved from reading',
                    createdAt: sp.createdAt instanceof Date
                        ? sp.createdAt
                        : (sp.createdAt && typeof sp.createdAt === 'object' && 'toDate' in sp.createdAt)
                            ? (sp.createdAt as { toDate: () => Date }).toDate()
                            : new Date(sp.createdAt as string || Date.now()),
                    showCount: sp.usageCount || 0,
                    practiceCount: sp.practiceCount || 0,
                    nextShowAt: null,
                    retired: (sp.usageCount || 0) >= 6,
                    topics: (sp.topics as TopicValue[] | undefined)?.length ? sp.topics as TopicValue[] : ((sp as any).topic ? [(sp as any).topic] : undefined),
                    topic: (sp as any).topic,
                    subtopics: (sp as any).subtopics || ((sp as any).subtopic ? [(sp as any).subtopic] : undefined),
                    subtopic: (sp as any).subtopic,
                    children: (sp as { children?: ChildExpression[] }).children,
                    register: (sp as any).register ||
                        ((sp as any).usage === 'spoken' ? 'casual' :
                            (sp as any).usage === 'written' ? 'formal' : 'consultative'),
                    nuance: (sp as any).nuance || 'neutral',
                    parentPhraseId: (sp as any).parentPhraseId,
                    childPhraseIds: (sp as any).childPhraseIds,
                    source: (sp as any).difficulty === 'import' ? 'import' : 'reading',
                    nextReviewDate: (sp as any).nextReviewDate,
                }));
                setPhrases(displayPhrases);
            } catch (error) {
                console.error('Error loading phrases:', error);
            }
            setLoading(false);
        };
        loadPhrases();
    }, [user?.$id, authLoading]);

    // Filtering
    const filteredPhrases = useMemo(() => {
        return phrases.filter(p => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!p.phrase.toLowerCase().includes(q) && !p.meaning.toLowerCase().includes(q)) return false;
            }
            if (activeView === 'imported') {
                return p.source === 'import';
            }
            if (activeView !== 'all') {
                if (!p.topics || !p.topics.includes(activeView as TopicValue)) return false;
            }
            return true;
        });
    }, [phrases, searchQuery, activeView]);

    // Import stats
    const importStats = useMemo(() => {
        const imported = phrases.filter(p => p.source === 'import');
        const active = imported.filter(p => !p.nextReviewDate || new Date(p.nextReviewDate) <= new Date());
        const pending = imported.filter(p => p.nextReviewDate && new Date(p.nextReviewDate) > new Date());
        return { total: imported.length, active: active.length, pending: pending.length };
    }, [phrases]);

    // Unique topics for filter tabs
    const uniqueTopics = useMemo(() => {
        return Array.from(new Set(
            phrases.flatMap(p => p.topics || []).filter(t => t && t !== 'high_frequency')
        ));
    }, [phrases]);

    // Delete ALL handler
    const handleDeleteAll = useCallback(async () => {
        if (!await confirm({
            title: 'Delete All Phrases',
            description: `This will permanently delete all ${phrases.length} phrase${phrases.length !== 1 ? 's' : ''} from your vocab bank. This cannot be undone.`,
            confirmText: 'Delete All',
            destructive: true,
        })) return;

        try {
            const res = await fetch('/api/user/delete-all-phrases', {
                method: 'DELETE',
                headers: { 'x-user-id': user!.$id },
            });
            if (res.ok) {
                const { deleted } = await res.json();
                setPhrases([]);
                if (user?.$id) {
                    localStorage.removeItem(`due_clusters_${user.$id}`);
                    localStorage.removeItem(`ondemand_clusters_${user.$id}`);
                }
                toast.success(`Deleted ${deleted} phrase${deleted !== 1 ? 's' : ''}`);
            } else {
                toast.error('Failed to delete all phrases');
            }
        } catch {
            toast.error('Failed to delete all phrases');
        }
    }, [confirm, phrases.length, user?.$id]);

    // Delete handler
    const handleDeletePhrase = useCallback(async (phraseId: string) => {
        if (!await confirm({
            title: 'Delete Phrase',
            description: 'This phrase and its child expressions will be permanently removed.',
            confirmText: 'Delete',
            destructive: true,
            dontAskAgainKey: 'delete-phrase',
        })) return;

        try {
            const res = await fetch('/api/user/delete-phrase', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phraseId }),
            });
            if (res.ok) {
                setPhrases(prev => prev.filter(p => p.id !== phraseId));
                if (user?.$id) {
                    localStorage.removeItem(`due_clusters_${user.$id}`);
                    localStorage.removeItem(`ondemand_clusters_${user.$id}`);
                }
                toast.success('Phrase deleted');
            } else {
                toast.error('Failed to delete');
            }
        } catch {
            toast.error('Failed to delete');
        }
    }, [confirm, user?.$id]);

    // Available topics for modal editing
    const availableTopics = useMemo(() => [
        { value: 'high_frequency', label: '⚡ High Frequency' },
        ...uniqueTopics.map(t => ({ value: t, label: formatTopicLabel(t) })),
    ], [uniqueTopics]);

    // Stats
    const statsNew = phrases.filter(p => getStatus(p.showCount) === 'new').length;
    const statsReviewing = phrases.filter(p => getStatus(p.showCount) === 'reviewing').length;
    const statsMastered = phrases.filter(p => getStatus(p.showCount) === 'mastered').length;

    // Reload phrases after import
    const handleImportComplete = useCallback(async () => {
        if (!user?.$id) return;
        try {
            const savedPhrases = await getUserPhrases(user.$id, 5000);
            const visiblePhrases = savedPhrases.filter(sp => {
                const hasParent = !!(sp as any).parentPhraseId;
                const hasAppeared = (sp as any).hasAppearedInExercise === true;
                return !hasParent || hasAppeared;
            });
            const displayPhrases: Phrase[] = visiblePhrases.map(sp => ({
                id: sp.id,
                phrase: sp.phrase,
                meaning: sp.meaning,
                context: sp.context,
                sourceTitle: 'Saved from reading',
                createdAt: sp.createdAt instanceof Date
                    ? sp.createdAt
                    : (sp.createdAt && typeof sp.createdAt === 'object' && 'toDate' in sp.createdAt)
                        ? (sp.createdAt as { toDate: () => Date }).toDate()
                        : new Date(sp.createdAt as string || Date.now()),
                showCount: sp.usageCount || 0,
                practiceCount: sp.practiceCount || 0,
                nextShowAt: null,
                retired: (sp.usageCount || 0) >= 6,
                topics: (sp.topics as TopicValue[] | undefined)?.length ? sp.topics as TopicValue[] : ((sp as any).topic ? [(sp as any).topic] : undefined),
                topic: (sp as any).topic,
                subtopics: (sp as any).subtopics || ((sp as any).subtopic ? [(sp as any).subtopic] : undefined),
                subtopic: (sp as any).subtopic,
                children: (sp as { children?: ChildExpression[] }).children,
                register: (sp as any).register || 'consultative',
                nuance: (sp as any).nuance || 'neutral',
                parentPhraseId: (sp as any).parentPhraseId,
                childPhraseIds: (sp as any).childPhraseIds,
                source: (sp as any).difficulty === 'import' ? 'import' : 'reading',
                nextReviewDate: (sp as any).nextReviewDate,
            }));
            setPhrases(displayPhrases);
        } catch (error) {
            console.error('Error reloading phrases after import:', error);
        }
    }, [user?.$id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white font-sans">
            {/* ─── Header ─── */}
            <header className="max-w-6xl mx-auto px-6 pt-16 pb-10">
                <h1
                    className="text-[72px] font-normal text-neutral-900 leading-none tracking-tight"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                >
                    Glossary.
                </h1>
                <p className="text-sm text-neutral-400 tracking-[0.08em] uppercase mt-3 max-w-md">
                    A curated editorial index of linguistic nuances and expanded meanings.
                </p>

                {/* Stats bar */}
                <div className="flex items-center justify-between mt-8">
                    <div className="flex items-center gap-6 text-xs text-neutral-400">
                        <span><strong className="text-neutral-900 text-lg font-normal">{phrases.length}</strong> phrases</span>
                        <span className="text-neutral-200">|</span>
                        <span><strong className="text-emerald-600 font-medium">{statsMastered}</strong> mastered</span>
                        <span><strong className="text-amber-500 font-medium">{statsReviewing}</strong> reviewing</span>
                        <span><strong className="text-neutral-400 font-medium">{statsNew}</strong> new</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-400 transition-all duration-200"
                        >
                            <Upload className="w-3 h-3" />
                            Import
                        </button>
                        {phrases.length > 0 && (
                            <button
                                onClick={handleDeleteAll}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400 hover:text-red-500 hover:bg-red-50 border border-neutral-200 hover:border-red-200 transition-all duration-200"
                            >
                                <Trash2 className="w-3 h-3" />
                                Delete All
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Practice Nudge Banner */}
            {statsReviewing > 0 && (
                <div className="max-w-6xl mx-auto px-6 pb-8">
                    <div className="bg-neutral-900 rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-neutral-800">
                        <div>
                            <h3 className="text-white text-lg font-medium tracking-tight">You have phrases due for review</h3>
                            <p className="text-neutral-400 text-sm mt-1">Master your saved vocabulary with an immersive practice session.</p>
                        </div>
                        <button
                            onClick={() => router.push('/practice')}
                            className="bg-white text-neutral-900 px-5 py-2.5 rounded-md text-sm font-bold uppercase tracking-[0.08em] hover:bg-neutral-100 transition-colors flex items-center gap-2 flex-shrink-0"
                        >
                            <Play className="w-4 h-4" fill="currentColor" />
                            Start Practice
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Search + Filters ─── */}
            <div className="max-w-6xl mx-auto px-6 pb-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                    {/* Topic tabs */}
                    <div className="flex gap-1 overflow-x-auto -mb-px flex-1">
                        {[
                            { value: 'all', label: 'All' },
                            ...(importStats.total > 0 ? [{ value: 'imported', label: `Imported (${importStats.total})` }] : []),
                            ...uniqueTopics.map(t => ({ value: t, label: formatTopicLabel(t) })),
                        ].map(tab => (
                            <button
                                key={tab.value}
                                onClick={() => setActiveView(tab.value)}
                                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeView === tab.value
                                    ? 'border-neutral-900 text-neutral-900'
                                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search & View Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-300" />
                            <input
                                placeholder="Search phrases..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 text-sm bg-neutral-50 border border-neutral-100 w-48 lg:w-64 focus:outline-none focus:ring-1 focus:ring-neutral-300 focus:border-neutral-300 transition-all placeholder:text-neutral-300"
                            />
                        </div>
                        <button
                            onClick={() => setIsGraphView(!isGraphView)}
                            className="px-4 py-2 text-sm bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
                        >
                            {isGraphView ? 'List View' : 'Graph View'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Content Area ─── */}
            <div className="max-w-6xl mx-auto px-6 pb-24">
                {filteredPhrases.length === 0 ? (
                    <div className="text-center py-24">
                        {phrases.length === 0 && !searchQuery ? (
                            /* Empty glossary nudge */
                            <div className="max-w-md mx-auto">
                                <h3
                                    className="text-[36px] font-normal text-neutral-900 leading-tight tracking-tight mb-3"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    Your glossary is empty.
                                </h3>
                                <p className="text-sm text-neutral-400 mb-8">
                                    Start reading articles to save phrases, or import your existing vocabulary.
                                </p>
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => router.push('/')}
                                        className="px-5 py-2.5 border border-neutral-200 text-neutral-600 text-[11px] font-bold uppercase tracking-[0.1em] hover:border-neutral-900 hover:text-neutral-900 transition-colors"
                                    >
                                        Browse Articles
                                    </button>
                                    <button
                                        onClick={() => setShowImportModal(true)}
                                        className="px-5 py-2.5 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-neutral-800 transition-colors flex items-center gap-2"
                                    >
                                        <Upload className="w-3 h-3" />
                                        Import Vocabulary
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-lg text-neutral-300 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                {searchQuery ? 'No phrases match your search.' : 'No phrases in this category.'}
                            </p>
                        )}
                    </div>
                ) : isGraphView ? (
                    <div className="w-full h-[600px] rounded-lg shadow-sm border border-neutral-100 overflow-hidden">
                        <VocabGraph
                            phrases={filteredPhrases}
                            onNodeClick={(node) => {
                                if (node.originalPhrase) {
                                    setSelectedPhrase(node.originalPhrase);
                                } else if (node.group === 'child') {
                                    // If child is clicked, find parent and open it
                                    const parent = filteredPhrases.find(p => p.children?.some(c => c.id === node.id));
                                    if (parent) setSelectedPhrase(parent);
                                }
                            }}
                        />
                    </div>
                ) : (
                    <div className="border-l border-t border-neutral-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            <AnimatePresence mode="popLayout">
                                {filteredPhrases.map(phrase => (
                                    <VocabCard
                                        key={phrase.id}
                                        phrase={phrase}
                                        onOpenDetail={() => setSelectedPhrase(phrase)}
                                        onDelete={() => handleDeletePhrase(phrase.id)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {/* Footer count */}
                <div className="mt-8 text-center text-[11px] text-neutral-300 uppercase tracking-wider">
                    {filteredPhrases.length} of {phrases.length} phrases
                </div>
            </div>

            {/* ─── Detail Modal ─── */}
            <AnimatePresence>
                {selectedPhrase && (
                    <DetailModal
                        phrase={selectedPhrase}
                        onClose={() => setSelectedPhrase(null)}
                        onUpdate={(id, updates) => {
                            setPhrases(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
                            setSelectedPhrase(prev => prev ? { ...prev, ...updates } : null);
                        }}
                        availableTopics={availableTopics}
                    />
                )}
            </AnimatePresence>

            {/* Import Modal */}
            <ImportVocabModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportComplete={handleImportComplete}
            />

            {DialogComponent}
        </div>
    );
}
