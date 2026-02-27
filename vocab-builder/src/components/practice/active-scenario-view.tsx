'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Mic, StopCircle, RefreshCw } from 'lucide-react';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice'; // Correct import
import { toast } from 'sonner';

interface ActiveScenarioViewProps {
    phrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
    }>;
    context: {
        theme: string;
        setting: string;
        roles: {
            user: string;
            ai: string;
        };
        pragmatics: {
            register: string;
            relationship: string;
        }
    };
    onComplete: (results: Map<string, 'correct' | 'wrong'>) => void;
}

export function ActiveScenarioView({ phrases, context, onComplete }: ActiveScenarioViewProps) {
    // Hooks - Use Continuous Mode
    const { isConnected, isAiSpeaking, isTalking, connect, disconnect, error } = useRealtimeVoice('ws://localhost:8081');
    const [hasStarted, setHasStarted] = useState(false);

    // Initial Start
    useEffect(() => {
        if (!hasStarted) {
            startScenario();
            setHasStarted(true);
        }
    }, [hasStarted]);

    // Error Handling
    useEffect(() => {
        if (error) { // Correct variable name
            toast.error(`Visualizer Error: ${error}`);
        }
    }, [error]);

    const startScenario = () => {
        const phraseList = phrases.map(p => `"${p.phrase}"`).join(', ');
        const systemContext = `
Role: ${context.roles.ai}.
Setting: ${context.setting}.
Tone: ${context.pragmatics.register}.
PEDAGOGICAL GOAL: Elicit these phrases: ${phraseList}.
Start the conversation immediately by speaking the first line.
`.trim();

        console.log("Starting Live Session...");
        connect(systemContext);
    };

    const handleRestart = () => {
        disconnect();
        setTimeout(() => startScenario(), 500);
    };

    return (
        <div className="flex flex-col h-full items-center justify-center p-6 bg-slate-950 text-white min-h-[500px] rounded-2xl relative overflow-hidden">

            {/* Background Ambience */}
            <div className={`absolute inset-0 transition-opacity duration-1000 pointer-events-none ${isAiSpeaking ? 'opacity-20 bg-indigo-900' : 'opacity-0'}`} />

            {/* Header */}
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center text-slate-400 text-sm z-10">
                <span className="font-semibold tracking-wider uppercase">{context.theme}</span>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-colors duration-300 
                        ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="uppercase text-xs font-bold">
                        {isConnected ? 'LIVE' : 'OFFLINE'}
                    </span>
                </div>
            </div>

            {/* Main Interaction Area */}
            <div className="flex flex-col items-center gap-12 z-10 w-full max-w-lg">

                {/* Avatar Visualizer */}
                <div className="relative group">
                    <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-300 
                        ${isAiSpeaking ? 'scale-110 shadow-[0_0_60px_rgba(99,102,241,0.4)] bg-indigo-600' :
                            isTalking ? 'scale-105 border-4 border-emerald-500/50 bg-slate-800' :
                                'scale-100 bg-slate-900 border-2 border-slate-700'}`}>

                        {isAiSpeaking ? (
                            <div className="flex gap-1.5 items-center justify-center h-16">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i}
                                        className="w-2.5 bg-white rounded-full animate-[bounce_1s_infinite]"
                                        style={{ animationDelay: `${i * 0.15}s`, height: '40%' }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Mic className={`w-16 h-16 transition-colors ${isTalking ? 'text-emerald-400' : 'text-slate-600'}`} />
                        )}
                    </div>
                </div>

                {/* Status Text */}
                <div className="min-h-[40px] text-center">
                    <p className="text-slate-400 font-light tracking-wide animate-pulse">
                        {isAiSpeaking ? "AI Speaking..." :
                            isTalking ? "Listening..." :
                                isConnected ? "Waiting for you..." : "Connecting..."}
                    </p>
                </div>

                {/* Controls */}
                <div className="flex gap-4">
                    <Button onClick={handleRestart} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                        <RefreshCw className="w-4 h-4 mr-2" /> Restart Call
                    </Button>
                    <Button onClick={disconnect} variant="destructive" className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/50 border">
                        <StopCircle className="w-4 h-4 mr-2" /> End Call
                    </Button>
                </div>
            </div>
        </div>
    );
}
