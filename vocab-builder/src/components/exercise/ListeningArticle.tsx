import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Activity, Headphones } from 'lucide-react';
import { useTTS } from '@/hooks/use-tts';

interface AudioSectionProps {
    section: {
        id: string;
        content: string;
        vocabPhrases: string[];
        audioUrl?: string;
    };
    isBeyondGate: boolean;
    isPassed: boolean;
    isActive: boolean;
}

export function AudioSection({ section, isBeyondGate, isPassed, isActive }: AudioSectionProps) {
    const { play, playFromUrl, stop, isPlaying } = useTTS();
    const [hasPlayed, setHasPlayed] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);

    // Stop audio on unmount or when it's no longer the active section
    useEffect(() => {
        if (!isActive) {
            stop();
        }
        return () => stop();
    }, [isActive, stop]);

    const handlePlay = async () => {
        setHasPlayed(true);
        if (section.audioUrl) {
            await playFromUrl(section.audioUrl);
        } else {
            await play(section.content);
        }
    };

    // Auto-reveal transcript when passed
    useEffect(() => {
        if (isPassed && !showTranscript) {
            setShowTranscript(true);
        }
    }, [isPassed, showTranscript]);

    return (
        <div className={`relative my-10 transition-all duration-500 ${isBeyondGate ? 'opacity-40 pointer-events-none blur-[2px]' : ''}`}>
            {/* Audio Player Card */}
            <div className="bg-white border border-neutral-200 p-8 shadow-sm flex flex-col items-center justify-center">
                <div 
                    onClick={handlePlay}
                    className={`w-20 h-20 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${
                        isPlaying 
                            ? 'border-indigo-600 bg-indigo-50 shadow-inner' 
                            : hasPlayed 
                                ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
                                : 'border-neutral-200 bg-white hover:border-neutral-900 shadow-sm'
                    }`}
                >
                    {isPlaying ? (
                        <Activity className="w-8 h-8 text-indigo-600 animate-pulse" />
                    ) : (
                        <Play className={`w-8 h-8 ml-1 ${hasPlayed ? 'text-white' : 'text-neutral-900'}`} />
                    )}
                </div>
                
                <p className={`mt-6 text-[10px] font-bold uppercase tracking-widest ${isPlaying ? 'text-indigo-600' : 'text-neutral-500'}`}>
                    {isPlaying ? 'Playing...' : hasPlayed ? 'Listen Again' : 'Tap to Listen'}
                </p>

                {/* Show toggle for transcript if played but not passed yet */}
                {hasPlayed && !isPassed && (
                    <button 
                        onClick={() => setShowTranscript(prev => !prev)}
                        className="mt-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors border-b border-transparent hover:border-neutral-900 pb-0.5"
                    >
                        {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                    </button>
                )}
            </div>

            {/* Transcript Area */}
            <AnimatePresence>
                {showTranscript && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="overflow-hidden mt-6"
                    >
                        <div className="p-6 md:p-8 bg-neutral-50 border border-neutral-100 rounded-sm">
                            <div className="flex items-center gap-2 mb-4 text-neutral-400">
                                <Headphones className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Transcript</span>
                            </div>
                            <div 
                                className="text-[17px] leading-[1.9] text-neutral-800"
                                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                dangerouslySetInnerHTML={{
                                    __html: section.content.split('\n\n').filter(p => p.trim()).map(p => `<p class="mb-4 last:mb-0">${p.trim()}</p>`).join('')
                                }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
