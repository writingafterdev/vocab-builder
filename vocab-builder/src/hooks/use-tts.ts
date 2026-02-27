import { useState, useCallback, useRef, useEffect } from 'react';

interface TTSState {
    isPlaying: boolean;
    isLoading: boolean;
    error: string | null;
}

interface UseTTSResult extends TTSState {
    play: (text: string, voice?: string, messageId?: string) => Promise<void>;
    stop: () => void;
}

export function useTTS(): UseTTSResult {
    const [state, setState] = useState<TTSState>({
        isPlaying: false,
        isLoading: false,
        error: null,
    });

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const textRef = useRef<string>(''); // Track current text to prevent re-fetching if same

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        // Increment request ID to invalidate any pending fetches
        requestIdRef.current += 1;
        setState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    }, []);

    const requestIdRef = useRef(0);

    const play = useCallback(async (text: string, voice: string = 'default', messageId?: string) => {
        stop(); // Stop potential previous audio AND invalidate pending requests

        if (!text) return;

        const currentId = requestIdRef.current;
        setState({ isPlaying: false, isLoading: true, error: null });
        textRef.current = text;

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch audio');
            }

            // CHECK: Has stop() (or another play()) been called since we started?
            if (currentId !== requestIdRef.current) {
                return; // Abandon this result, it's stale
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => {
                setState(prev => ({ ...prev, isPlaying: false }));
                URL.revokeObjectURL(url); // Cleanup
            };

            audio.onerror = (e) => {
                console.error('Audio playback error', e);
                setState({ isPlaying: false, isLoading: false, error: 'Playback failed' });
            };

            // Double check before playing
            if (currentId !== requestIdRef.current) return;

            await audio.play();
            setState({ isPlaying: true, isLoading: false, error: null });

        } catch (err) {
            // Ignore errors from stale requests
            if (currentId !== requestIdRef.current) return;

            console.error('TTS error:', err);
            setState({ isPlaying: false, isLoading: false, error: 'Failed to generate speech' });
        }
    }, [stop]);

    return {
        ...state,
        play,
        stop,
    };
}
