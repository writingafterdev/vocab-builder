'use client';

/**
 * ChunkFeedback - ELSA-style comprehensive pronunciation feedback
 * 
 * KEY DESIGN PRINCIPLES:
 * 1. Show ALL words - no truncation
 * 2. Always explain WHY scores are what they are
 * 3. Make errors and issues PROMINENT
 * 4. No contradictory states (e.g., "all correct" with 90%)
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle2, AlertCircle, RotateCcw, ArrowRight,
    Volume2, ChevronDown, ChevronUp, Sparkles, Zap, Info, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScoreCircle } from '@/components/feedback/ScoreCircle';
import { WordDetailModal } from './WordDetailModal';
import { IntonationChart } from './IntonationChart';
import type { SpeakingAnalysisResult } from '@/lib/speaking-feedback';
import { useState, useCallback } from 'react';

interface ChunkFeedbackProps {
    feedback: SpeakingAnalysisResult;
    canRetry: boolean;
    onRetry: () => void;
    onNext: () => void;
    isLastChunk: boolean;
    userAudioUrl?: string;
    referenceAudioUrl?: string;
}

// Word Pill Component
function WordPill({
    word,
    status,
    annotation,
    onClick
}: {
    word: string;
    status: string;
    annotation?: string;
    onClick: () => void;
}) {
    const getStyle = () => {
        switch (status) {
            case 'correct':
                return 'bg-green-900/40 text-green-400 border-green-600/60 hover:bg-green-800/50';
            case 'pronunciation':
                return 'bg-red-900/50 text-red-300 border-red-500/70 hover:bg-red-800/60 ring-2 ring-red-500/50';
            case 'added':
                return 'bg-amber-900/40 text-amber-400 border-amber-600/60 hover:bg-amber-800/50 italic';
            case 'omitted':
                return 'bg-slate-700/50 text-slate-400 border-slate-500/50 line-through';
            default:
                return 'bg-slate-700/40 text-slate-300 border-slate-600/50';
        }
    };

    const hasError = status === 'pronunciation' || status === 'added' || status === 'omitted';

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${getStyle()}`}
        >
            {word}
            {hasError && annotation && (
                <span className="ml-1.5 text-[10px] opacity-80 bg-black/20 px-1 rounded">
                    {annotation}
                </span>
            )}
        </motion.button>
    );
}

// Expandable Skill Section with EXPLANATION
function SkillSection({
    title,
    score,
    icon,
    explanation,
    children,
    defaultOpen = false,
    hasIssues = false
}: {
    title: string;
    score: number;
    icon: React.ReactNode;
    explanation: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    hasIssues?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const getScoreColor = () => {
        if (score >= 85) return 'text-green-400 bg-green-900/40';
        if (score >= 70) return 'text-amber-400 bg-amber-900/40';
        return 'text-red-400 bg-red-900/40';
    };

    return (
        <div className={`rounded-xl border overflow-hidden ${hasIssues ? 'border-amber-600/50 bg-amber-950/20' : 'border-slate-700/50 bg-slate-900/40'
            }`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${getScoreColor()} flex items-center justify-center`}>
                        {icon}
                    </div>
                    <div className="text-left">
                        <span className="text-white font-medium block">{title}</span>
                        <span className="text-slate-400 text-xs">{explanation}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {hasIssues && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                    <span className={`font-bold text-lg ${getScoreColor().split(' ')[0]}`}>{score}%</span>
                    {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 border-t border-slate-700/50">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Celebration for high scores
function Celebration({ score }: { score: number }) {
    if (score < 85) return null;
    return (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-2 -right-2">
            <Sparkles className="h-6 w-6 text-yellow-400" />
        </motion.div>
    );
}

export function ChunkFeedback({
    feedback,
    canRetry,
    onRetry,
    onNext,
    isLastChunk,
    userAudioUrl,
    referenceAudioUrl
}: ChunkFeedbackProps) {
    const [selectedWord, setSelectedWord] = useState<{
        word: string;
        status: string;
        annotation?: string;
        correction?: string;
    } | null>(null);
    const [comparePlaying, setComparePlaying] = useState(false);

    // Get correction for a word
    const getCorrection = useCallback((word: string) => {
        const issue = feedback.skills.pronunciation.issues.find(
            i => i.word.toLowerCase() === word.toLowerCase()
        );
        return issue?.correction;
    }, [feedback.skills.pronunciation.issues]);

    // Compare playback
    const playComparison = async () => {
        if (!referenceAudioUrl || !userAudioUrl) return;
        setComparePlaying(true);
        const refAudio = new Audio(referenceAudioUrl);
        await new Promise<void>((resolve) => { refAudio.onended = () => resolve(); refAudio.play(); });
        await new Promise(resolve => setTimeout(resolve, 500));
        const userAudio = new Audio(userAudioUrl);
        await new Promise<void>((resolve) => { userAudio.onended = () => resolve(); userAudio.play(); });
        setComparePlaying(false);
    };

    // Count issues for prominent display
    const pronunciationIssues = feedback.skills.pronunciation.issues;
    const hasPronunciationIssues = pronunciationIssues.length > 0;
    const fluencyIssues: string[] = [];
    if (feedback.skills.fluency.pauseCount > 3) fluencyIssues.push(`${feedback.skills.fluency.pauseCount} excessive pauses`);
    if (feedback.skills.fluency.speechRate < 100) fluencyIssues.push('Speaking too slowly');
    if (feedback.skills.fluency.speechRate > 160) fluencyIssues.push('Speaking too fast');
    if ((feedback.skills.fluency.fillers?.length || 0) > 0) fluencyIssues.push(`Fillers: ${feedback.skills.fluency.fillers?.join(', ')}`);
    const hasFluencyIssues = fluencyIssues.length > 0;

    const connectedPatterns = feedback.skills.connectedSpeech.patterns || [];
    const incorrectPatterns = connectedPatterns.filter(p => !p.correct);
    const hasConnectedIssues = incorrectPatterns.length > 0;

    // Generate explanations
    const getPronunciationExplanation = () => {
        const score = feedback.skills.pronunciation.score;
        if (score >= 95) return 'Excellent clarity on all words';
        if (score >= 85) return `${pronunciationIssues.length} minor issues detected`;
        if (score >= 70) return `${pronunciationIssues.length} words need attention`;
        return `${pronunciationIssues.length} significant pronunciation errors`;
    };

    const getFluencyExplanation = () => {
        const score = feedback.skills.fluency.score;
        const rate = feedback.skills.fluency.speechRate;
        if (score >= 90) return `Smooth flow at ${rate} WPM`;
        if (hasFluencyIssues) return fluencyIssues[0];
        if (score >= 70) return `Mostly smooth, ${rate} WPM`;
        return 'Choppy or hesitant delivery';
    };

    const getConnectedExplanation = () => {
        if (connectedPatterns.length === 0) return 'No linking patterns detected in this chunk';
        if (hasConnectedIssues) return `${incorrectPatterns.length} linking issues found`;
        return 'Good word connections and flow';
    };

    const showRetryNudge = feedback.overallScore < 60 && canRetry;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden"
        >
            {/* Header */}
            <div className="relative p-6 bg-gradient-to-r from-slate-800 to-slate-800/50">
                <Celebration score={feedback.overallScore} />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <ScoreCircle score={feedback.overallScore} size="lg" />
                        <div>
                            <h3 className="text-white font-semibold text-lg">
                                {feedback.overallScore >= 90 ? '🎉 Excellent!' :
                                    feedback.overallScore >= 80 ? '✨ Great job!' :
                                        feedback.overallScore >= 70 ? 'Good effort!' : 'Needs practice'}
                            </h3>
                            <p className="text-slate-400 text-sm">{feedback.insights.strength}</p>
                        </div>
                    </div>
                    {referenceAudioUrl && userAudioUrl && (
                        <Button variant="outline" size="sm" onClick={playComparison} disabled={comparePlaying} className="text-slate-300 border-slate-600">
                            <Volume2 className="h-4 w-4 mr-2" />
                            {comparePlaying ? 'Playing...' : 'Compare'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* FULL TRANSCRIPT - Show ALL words */}
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-slate-300 text-sm font-medium">
                            Your Pronunciation
                        </h4>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                Correct
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-400/50" />
                                Issue
                            </span>
                        </div>
                    </div>

                    {/* ALL words - no slicing */}
                    <div className="flex flex-wrap gap-2">
                        {feedback.annotatedWords.map((word, i) => (
                            <WordPill
                                key={i}
                                word={word.text}
                                status={word.status}
                                annotation={word.annotation}
                                onClick={() => setSelectedWord({
                                    word: word.text,
                                    status: word.status,
                                    annotation: word.annotation,
                                    correction: getCorrection(word.text)
                                })}
                            />
                        ))}
                    </div>

                    <p className="text-slate-500 text-xs mt-3">
                        💡 Tap any word to hear correct pronunciation and see details
                    </p>
                </div>

                {/* PROMINENT ERRORS SECTION - if any issues */}
                {(hasPronunciationIssues || hasFluencyIssues || hasConnectedIssues) && (
                    <div className="bg-red-950/30 border border-red-700/50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="h-5 w-5 text-red-400" />
                            <h4 className="text-red-300 font-medium">Areas to Improve</h4>
                        </div>
                        <div className="space-y-2">
                            {pronunciationIssues.slice(0, 3).map((issue, i) => (
                                <div key={i} className="flex items-start gap-3 bg-red-900/20 rounded-lg p-3">
                                    <span className="text-red-400 font-mono text-sm">"{issue.word}"</span>
                                    <span className="text-slate-300 text-sm flex-1">{issue.correction}</span>
                                </div>
                            ))}
                            {fluencyIssues.map((issue, i) => (
                                <div key={`f-${i}`} className="flex items-center gap-3 bg-amber-900/20 rounded-lg p-3">
                                    <Zap className="h-4 w-4 text-amber-400" />
                                    <span className="text-slate-300 text-sm">{issue}</span>
                                </div>
                            ))}
                            {incorrectPatterns.slice(0, 2).map((pattern, i) => (
                                <div key={`c-${i}`} className="flex items-center gap-3 bg-amber-900/20 rounded-lg p-3">
                                    <Volume2 className="h-4 w-4 text-amber-400" />
                                    <span className="text-slate-300 text-sm">
                                        Link words: <span className="font-mono">{pattern.expected}</span> → you said: <span className="font-mono">{pattern.actual}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Skill Sections with explanations */}
                <div className="space-y-3">
                    {/* Pronunciation */}
                    <SkillSection
                        title="Pronunciation"
                        score={feedback.skills.pronunciation.score}
                        icon={<AlertCircle className="h-4 w-4" />}
                        explanation={getPronunciationExplanation()}
                        defaultOpen={hasPronunciationIssues}
                        hasIssues={hasPronunciationIssues}
                    >
                        {hasPronunciationIssues ? (
                            <div className="space-y-2">
                                {pronunciationIssues.map((issue, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 bg-red-900/20 rounded-lg border border-red-700/30">
                                        <div className="w-6 h-6 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs text-red-400">{i + 1}</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-white font-medium">"{issue.word}"</span>
                                                <span className="text-red-400 text-xs font-mono bg-red-900/30 px-1.5 py-0.5 rounded">{issue.issue}</span>
                                            </div>
                                            <p className="text-slate-300 text-sm">💡 {issue.correction}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-green-400 p-3 bg-green-900/20 rounded-lg">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm">
                                    {feedback.skills.pronunciation.score >= 95
                                        ? 'Perfect pronunciation!'
                                        : 'No major pronunciation errors detected. Minor improvements possible with practice.'}
                                </span>
                            </div>
                        )}
                    </SkillSection>

                    {/* Fluency */}
                    <SkillSection
                        title="Fluency"
                        score={feedback.skills.fluency.score}
                        icon={<Zap className="h-4 w-4" />}
                        explanation={getFluencyExplanation()}
                        hasIssues={hasFluencyIssues}
                    >
                        <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                                <div className="text-2xl font-bold text-white">{feedback.skills.fluency.speechRate}</div>
                                <div className="text-xs text-slate-400">WPM</div>
                                <div className={`text-xs mt-1 ${feedback.skills.fluency.speechRate >= 120 && feedback.skills.fluency.speechRate <= 150
                                        ? 'text-green-400' : 'text-amber-400'
                                    }`}>
                                    {feedback.skills.fluency.speechRate >= 120 && feedback.skills.fluency.speechRate <= 150
                                        ? '✓ Ideal range (120-150)'
                                        : feedback.skills.fluency.speechRate < 120 ? '↓ Below ideal' : '↑ Above ideal'}
                                </div>
                            </div>
                            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                                <div className="text-2xl font-bold text-white">{feedback.skills.fluency.pauseCount}</div>
                                <div className="text-xs text-slate-400">Pauses</div>
                                <div className={`text-xs mt-1 ${feedback.skills.fluency.pauseCount <= 2 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {feedback.skills.fluency.pauseCount <= 2 ? '✓ Natural' : '⚠ Too many pauses'}
                                </div>
                            </div>
                            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                                <div className="text-2xl font-bold text-white">{feedback.skills.fluency.fillers?.length || 0}</div>
                                <div className="text-xs text-slate-400">Fillers</div>
                                <div className={`text-xs mt-1 ${(feedback.skills.fluency.fillers?.length || 0) === 0 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {(feedback.skills.fluency.fillers?.length || 0) === 0 ? '✓ None detected' : `⚠ ${feedback.skills.fluency.fillers?.join(', ')}`}
                                </div>
                            </div>
                        </div>

                        {/* Fluency explanation */}
                        <div className="p-3 bg-slate-800/30 rounded-lg">
                            <p className="text-slate-400 text-sm">
                                <Info className="h-4 w-4 inline mr-1" />
                                {feedback.skills.fluency.score >= 90
                                    ? 'Your speech flows smoothly with natural rhythm and pacing.'
                                    : feedback.skills.fluency.score >= 70
                                        ? 'Good overall flow. Try to reduce pauses and maintain steady pace.'
                                        : 'Work on speaking more continuously without long pauses or hesitations.'}
                            </p>
                        </div>
                    </SkillSection>

                    {/* Connected Speech */}
                    <SkillSection
                        title="Connected Speech"
                        score={feedback.skills.connectedSpeech.score}
                        icon={<Volume2 className="h-4 w-4" />}
                        explanation={getConnectedExplanation()}
                        hasIssues={hasConnectedIssues}
                    >
                        {connectedPatterns.length > 0 ? (
                            <div className="space-y-2">
                                {connectedPatterns.map((pattern, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between p-3 rounded-lg border ${pattern.correct
                                                ? 'bg-green-900/20 border-green-700/30'
                                                : 'bg-amber-900/20 border-amber-700/30'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-slate-500 uppercase w-16">{pattern.type}</span>
                                            <span className="text-white font-mono">{pattern.expected}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {pattern.correct ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                                            ) : (
                                                <>
                                                    <span className="text-amber-400 text-sm font-mono">→ {pattern.actual}</span>
                                                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-3 bg-slate-800/30 rounded-lg">
                                <p className="text-slate-400 text-sm">
                                    <Info className="h-4 w-4 inline mr-1" />
                                    Connected speech includes linking words together (e.g., "an apple" → "anapple"),
                                    reducing sounds, and natural word flow. This chunk may not have strong linking opportunities.
                                </p>
                            </div>
                        )}
                    </SkillSection>
                </div>

                {/* Intonation Chart */}
                {feedback.intonation.words.length > 0 && (
                    <IntonationChart
                        words={feedback.intonation.words}
                        expectedPattern={feedback.intonation.expectedPattern}
                        userPattern={feedback.intonation.userPattern}
                    />
                )}

                {/* Focus Tip */}
                <div className="bg-teal-900/30 border border-teal-700/50 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-900/50 flex items-center justify-center flex-shrink-0">
                            💡
                        </div>
                        <div>
                            <h4 className="text-teal-300 font-medium mb-1">Focus: {feedback.insights.focusArea}</h4>
                            <p className="text-slate-300 text-sm">{feedback.insights.tip}</p>
                        </div>
                    </div>
                </div>

                {/* Retry nudge for low scores */}
                {showRetryNudge && (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <RotateCcw className="h-5 w-5 text-amber-400" />
                            <p className="text-amber-300">Score below 60 — want to try again?</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onRetry} className="text-amber-300 hover:text-amber-200">
                            Retry
                        </Button>
                    </motion.div>
                )}
            </div>

            {/* Actions footer */}
            <div className="flex justify-between items-center p-6 border-t border-slate-700/50 bg-slate-900/30">
                {canRetry && !showRetryNudge ? (
                    <Button variant="ghost" size="sm" onClick={onRetry} className="text-slate-400">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Try Again
                    </Button>
                ) : (
                    <span className="text-slate-500 text-sm">{canRetry ? '' : 'No retries remaining'}</span>
                )}
                <Button onClick={onNext} className="bg-teal-600 hover:bg-teal-500">
                    {isLastChunk ? 'View Summary' : 'Next Chunk'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
            </div>

            {/* Word Detail Modal */}
            <AnimatePresence>
                {selectedWord && (
                    <WordDetailModal
                        word={selectedWord.word}
                        status={selectedWord.status as 'correct' | 'pronunciation' | 'added' | 'omitted'}
                        annotation={selectedWord.annotation}
                        correction={selectedWord.correction}
                        onClose={() => setSelectedWord(null)}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}
