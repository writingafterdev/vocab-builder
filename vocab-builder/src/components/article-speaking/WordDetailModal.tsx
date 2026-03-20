'use client';

/**
 * WordDetailModal - Shows detailed phoneme feedback for a clicked word
 * 
 * Features:
 * - Phoneme breakdown visualization
 * - Correct vs incorrect sounds highlighted
 * - Audio playback of correct pronunciation
 * - Articulation tips
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect } from 'react';

interface WordDetailModalProps {
    word: string;
    status: 'correct' | 'pronunciation' | 'added' | 'omitted';
    annotation?: string;
    correction?: string;
    onClose: () => void;
}

// Common phoneme patterns for English sounds
const getPhonemeBreakdown = (word: string, issue?: string): { phoneme: string; correct: boolean; tip?: string }[] => {
    const lowerWord = word.toLowerCase();

    // If we have an issue like "th→d", extract the problem
    const issueMatch = issue?.match(/(\w+)→(\w+)/);
    const wrongSound = issueMatch ? issueMatch[1] : null;

    // Simple phoneme approximation (for display purposes)
    const phonemes: { phoneme: string; correct: boolean; tip?: string }[] = [];

    // Check for common problematic sounds
    const problemSounds: Record<string, { display: string; tip: string }> = {
        'th': { display: '/θ/', tip: 'Place tongue between teeth' },
        'r': { display: '/r/', tip: 'Curl tongue back, don\'t touch roof' },
        'l': { display: '/l/', tip: 'Touch tongue to ridge behind teeth' },
        'v': { display: '/v/', tip: 'Bite lower lip gently' },
        'w': { display: '/w/', tip: 'Round lips, then release' },
        'ng': { display: '/ŋ/', tip: 'Back of tongue touches soft palate' },
        'sh': { display: '/ʃ/', tip: 'Push lips forward slightly' },
        'ch': { display: '/tʃ/', tip: 'Start with tongue on ridge, release with "sh"' },
    };

    let remaining = lowerWord;
    while (remaining.length > 0) {
        let matched = false;

        // Check for digraphs first (th, sh, ch, ng, etc.)
        for (const sound of Object.keys(problemSounds)) {
            if (remaining.startsWith(sound)) {
                const isWrong = wrongSound === sound;
                phonemes.push({
                    phoneme: problemSounds[sound].display,
                    correct: !isWrong,
                    tip: isWrong ? problemSounds[sound].tip : undefined
                });
                remaining = remaining.slice(sound.length);
                matched = true;
                break;
            }
        }

        if (!matched) {
            // Single letter to approximate phoneme
            const char = remaining[0];
            const vowels = 'aeiou';
            phonemes.push({
                phoneme: vowels.includes(char) ? `/${char}/` : `/${char}/`,
                correct: true
            });
            remaining = remaining.slice(1);
        }
    }

    return phonemes;
};

export function WordDetailModal({
    word,
    status,
    annotation,
    correction,
    onClose
}: WordDetailModalProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const phonemes = getPhonemeBreakdown(word, annotation);
    const hasIssues = status === 'pronunciation' || status === 'omitted';

    // Play TTS for the word
    const playWord = async () => {
        setIsPlaying(true);
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: word, speed: 0.8 })
            });

            if (response.ok) {
                const data = await response.json();
                const audio = new Audio(data.url);
                audio.onended = () => {
                    setIsPlaying(false);
                };
                audio.play();
            } else {
                setIsPlaying(false);
            }
        } catch {
            setIsPlaying(false);
        }
    };

    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            {hasIssues ? (
                                <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
                                    <AlertCircle className="h-5 w-5 text-red-400" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center">
                                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                                </div>
                            )}
                            <div>
                                <h3 className="text-white font-semibold text-xl">"{word}"</h3>
                                <p className="text-slate-400 text-sm">
                                    {hasIssues ? 'Needs practice' : 'Pronounced correctly'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="text-slate-400"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Play button */}
                    <button
                        onClick={playWord}
                        disabled={isPlaying}
                        className="w-full bg-slate-900/50 hover:bg-slate-900 rounded-xl p-4 mb-6 flex items-center justify-center gap-3 transition-colors border border-slate-700"
                    >
                        <div className={`w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}>
                            <Volume2 className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-white font-medium">
                            {isPlaying ? 'Playing...' : 'Listen to correct pronunciation'}
                        </span>
                    </button>

                    {/* Phoneme breakdown */}
                    <div className="mb-6">
                        <h4 className="text-slate-400 text-xs uppercase tracking-wide mb-3">
                            Sound Breakdown
                        </h4>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {phonemes.map((p, i) => (
                                <div
                                    key={i}
                                    className={`px-4 py-2 rounded-lg text-lg font-mono ${p.correct
                                            ? 'bg-green-900/30 text-green-400 border border-green-700/50'
                                            : 'bg-red-900/30 text-red-400 border border-red-700/50'
                                        }`}
                                >
                                    {p.phoneme}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Issue and correction */}
                    {annotation && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <span className="text-red-300 font-medium">What happened</span>
                            </div>
                            <p className="text-white">
                                You said <span className="text-red-400 font-mono">{annotation.split('→')[0]}</span>
                                {' '}instead of{' '}
                                <span className="text-green-400 font-mono">{annotation.split('→')[1] || 'correct sound'}</span>
                            </p>
                        </div>
                    )}

                    {/* Tip */}
                    {(correction || phonemes.some(p => p.tip)) && (
                        <div className="bg-teal-900/20 border border-teal-700/50 rounded-xl p-4">
                            <h4 className="text-teal-300 font-medium mb-2">💡 How to fix</h4>
                            <p className="text-slate-300 text-sm">
                                {correction || phonemes.find(p => p.tip)?.tip || 'Practice saying this word slowly.'}
                            </p>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
