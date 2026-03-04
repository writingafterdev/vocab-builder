'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, X, Zap, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SavedPhrase } from '@/lib/db/types';

import GridMatch from './minigames/GridMatch';
import WordSwipe from './minigames/WordSwipe';
import ContextCloze from './minigames/ContextCloze';
import ContextConstructor from './minigames/ContextConstructor';

interface VocabArcadeProps {
    phrases: SavedPhrase[];
    onClose: () => void;
    onComplete: (results: ArcadeResult) => void;
}

export interface ArcadeResult {
    score: number;
    correctIds: string[];
    incorrectIds: string[];
}

const GAME_DURATION = 60;

export default function VocabArcade({ phrases, onClose, onComplete }: VocabArcadeProps) {
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [score, setScore] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [gameOver, setGameOver] = useState(false);

    const [correctIds, setCorrectIds] = useState<string[]>([]);
    const [incorrectIds, setIncorrectIds] = useState<string[]>([]);

    const [currentGameType, setCurrentGameType] = useState<string>('');
    const [gameIteration, setGameIteration] = useState<number>(0);

    // Use refs for values accessed inside the timer to avoid re-render loops
    const timeLeftRef = useRef(GAME_DURATION);
    const isPlayingRef = useRef(false);

    // Determine which games are playable based on phrase data
    const availableGames = useMemo(() => {
        const games: string[] = ['GridMatch', 'WordSwipe']; // Always available
        const hasContext = phrases.some(p => p.context && p.context.trim().length > 0);
        if (hasContext) {
            games.push('ContextCloze');
            games.push('ContextConstructor');
        }
        return games;
    }, [phrases]);

    // Stable timer that does NOT depend on timeLeft — prevents re-render cascade
    useEffect(() => {
        if (!isPlaying) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                const next = prev - 1;
                timeLeftRef.current = next;
                if (next <= 0) {
                    clearInterval(timer);
                    // Defer game over to avoid state update during render
                    setTimeout(() => {
                        setIsPlaying(false);
                        isPlayingRef.current = false;
                        setGameOver(true);
                    }, 0);
                    return 0;
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isPlaying]); // Only depends on isPlaying, NOT timeLeft

    const nextMicroGame = useCallback(() => {
        const randomGame = availableGames[Math.floor(Math.random() * availableGames.length)];
        setCurrentGameType(randomGame);
        setGameIteration(prev => prev + 1);
    }, [availableGames]);

    const startGame = useCallback(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        nextMicroGame();
    }, [nextMicroGame]);

    const handleCorrect = useCallback((phraseId: string) => {
        setScore(s => s + 100);
        setTimeLeft(t => {
            const next = Math.min(t + 2, GAME_DURATION);
            timeLeftRef.current = next;
            return next;
        });
        setCorrectIds(prev => [...new Set([...prev, phraseId])]);
    }, []);

    const handleIncorrect = useCallback((phraseId: string) => {
        setTimeLeft(t => {
            const next = Math.max(t - 3, 0);
            timeLeftRef.current = next;
            return next;
        });
        setIncorrectIds(prev => [...new Set([...prev, phraseId])]);
    }, []);

    const finishArcade = useCallback(() => {
        onComplete({
            score,
            correctIds,
            incorrectIds
        });
    }, [onComplete, score, correctIds, incorrectIds]);

    if (gameOver) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm"
            >
                <div className="bg-card w-full max-w-md rounded-2xl shadow-xl p-8 text-center space-y-6 border">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                        <Trophy className="w-10 h-10 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold font-serif mb-2">Time&apos;s Up!</h2>
                        <p className="text-muted-foreground">You survived the gauntlet.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-6">
                        <div className="bg-muted p-4 rounded-xl">
                            <p className="text-sm text-muted-foreground mb-1">Score</p>
                            <p className="text-2xl font-bold text-primary">{score}</p>
                        </div>
                        <div className="bg-muted p-4 rounded-xl">
                            <p className="text-sm text-muted-foreground mb-1">Phrases Cleared</p>
                            <p className="text-2xl font-bold">{correctIds.length}</p>
                        </div>
                    </div>

                    <Button className="w-full h-12 text-lg" onClick={finishArcade}>
                        Claim XP & Return
                    </Button>
                </div>
            </motion.div>
        );
    }

    if (!isPlaying) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm">
                <div className="bg-card w-full max-w-md rounded-2xl shadow-xl p-8 text-center space-y-6 border">
                    <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>

                    <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto text-orange-500">
                        <Zap className="w-10 h-10" />
                    </div>

                    <div>
                        <h2 className="text-3xl font-bold font-serif mb-2">Vocab Arcade</h2>
                        <p className="text-muted-foreground">60 seconds. Rapid fire. <br /> Clear as many phrases as you can.</p>
                    </div>

                    <ul className="text-sm text-left space-y-2 bg-muted/50 p-4 rounded-xl text-muted-foreground">
                        <li className="flex items-center gap-2"><span className="text-green-500 font-bold">+2s</span> for correct answers</li>
                        <li className="flex items-center gap-2"><span className="text-red-500 font-bold">-3s</span> for mistakes</li>
                    </ul>

                    <Button className="w-full h-12 text-lg bg-orange-500 hover:bg-orange-600 text-white" onClick={startGame}>
                        Start Gauntlet
                    </Button>
                </div>
            </div>
        );
    }

    // Active Game State
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-card">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>
                    <div className="font-bold text-xl">{score} <span className="text-sm font-normal text-muted-foreground">pts</span></div>
                </div>

                <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : ''}`}>
                    <Timer className="w-6 h-6" />
                    {timeLeft}s
                </div>
            </div>

            <Progress value={(timeLeft / GAME_DURATION) * 100} className="h-1 rounded-none" />

            {/* Minigame Area */}
            <div className="flex-1 relative overflow-hidden bg-muted/10 pt-16">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${currentGameType}-${gameIteration}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex flex-col items-center justify-start p-4"
                    >
                        {currentGameType === 'GridMatch' && <GridMatch phrases={phrases} onCorrect={handleCorrect} onIncorrect={handleIncorrect} onComplete={nextMicroGame} />}
                        {currentGameType === 'WordSwipe' && <WordSwipe phrases={phrases} onCorrect={handleCorrect} onIncorrect={handleIncorrect} onComplete={nextMicroGame} />}
                        {currentGameType === 'ContextCloze' && <ContextCloze phrases={phrases} onCorrect={handleCorrect} onIncorrect={handleIncorrect} onComplete={nextMicroGame} />}
                        {currentGameType === 'ContextConstructor' && <ContextConstructor phrases={phrases} onCorrect={handleCorrect} onIncorrect={handleIncorrect} onComplete={nextMicroGame} />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
