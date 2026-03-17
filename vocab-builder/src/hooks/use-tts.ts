import { useState, useCallback, useRef, useEffect } from 'react';

interface TTSState {
    isPlaying: boolean;
    isLoading: boolean;
    error: string | null;
}

interface UseTTSResult extends TTSState {
    play: (text: string, voice?: string) => Promise<boolean>;
    playFromUrl: (url: string) => Promise<boolean>;
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
    
    // Track the active promise resolver
    const activeResolverRef = useRef<((completed: boolean) => void) | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (activeResolverRef.current) {
                activeResolverRef.current(false);
                activeResolverRef.current = null;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const stop = useCallback(() => {
        if (activeResolverRef.current) {
            activeResolverRef.current(false);
            activeResolverRef.current = null;
        }
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

    const play = useCallback(async (text: string, voice: string = 'default'): Promise<boolean> => {
        stop(); // Stop potential previous audio AND invalidate pending requests

        if (!text) return false;

        const currentId = requestIdRef.current;
        setState({ isPlaying: false, isLoading: true, error: null });
        textRef.current = text;

        return new Promise<boolean>(async (resolve) => {
            // Save the resolver so stop() can abort it
            activeResolverRef.current = resolve;

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
                    resolve(false);
                    return;
                }

                const blob = await response.blob();
                const url = URL.createObjectURL(blob);

                const audio = new Audio(url);
                audioRef.current = audio;

                audio.onended = () => {
                    if (currentId === requestIdRef.current) {
                        setState(prev => ({ ...prev, isPlaying: false }));
                        if (activeResolverRef.current === resolve) {
                            activeResolverRef.current = null;
                            resolve(true);
                        }
                    }
                    URL.revokeObjectURL(url); // Cleanup
                };

                audio.onerror = (e) => {
                    console.error('Audio playback error', e);
                    if (currentId === requestIdRef.current) {
                        setState({ isPlaying: false, isLoading: false, error: 'Playback failed' });
                        if (activeResolverRef.current === resolve) {
                            activeResolverRef.current = null;
                            resolve(false);
                        }
                    }
                };

                // Double check before playing
                if (currentId !== requestIdRef.current) {
                    resolve(false);
                    return;
                }

                await audio.play();
                setState({ isPlaying: true, isLoading: false, error: null });

            } catch (err) {
                // Ignore errors from stale requests
                if (currentId !== requestIdRef.current) {
                    resolve(false);
                    return;
                }

                console.error('TTS error:', err);
                setState({ isPlaying: false, isLoading: false, error: 'Failed to generate speech' });
                resolve(false);
            }
        });
    }, [stop]);

    const playFromUrl = useCallback(async (url: string): Promise<boolean> => {
        stop(); // Stop potential previous audio AND invalidate pending requests

        if (!url) return false;

        const currentId = requestIdRef.current;
        setState({ isPlaying: false, isLoading: true, error: null });

        return new Promise<boolean>(async (resolve) => {
            activeResolverRef.current = resolve;

            try {
                const audio = new Audio(url);
                audioRef.current = audio;

                audio.onended = () => {
                    if (currentId === requestIdRef.current) {
                        setState(prev => ({ ...prev, isPlaying: false }));
                        if (activeResolverRef.current === resolve) {
                            activeResolverRef.current = null;
                            resolve(true);
                        }
                    }
                };

                audio.onerror = (e) => {
                    console.error('Audio playback error', e);
                    if (currentId === requestIdRef.current) {
                        setState({ isPlaying: false, isLoading: false, error: 'Playback failed' });
                        if (activeResolverRef.current === resolve) {
                            activeResolverRef.current = null;
                            resolve(false);
                        }
                    }
                };

                if (currentId !== requestIdRef.current) {
                    resolve(false);
                    return;
                }

                await audio.play();
                setState({ isPlaying: true, isLoading: false, error: null });

            } catch (err) {
                if (currentId !== requestIdRef.current) {
                    resolve(false);
                    return;
                }

                console.error('Audio playback error:', err);
                setState({ isPlaying: false, isLoading: false, error: 'Failed to play audio' });
                resolve(false);
            }
        });
    }, [stop]);

    return {
        ...state,
        play,
        playFromUrl,
        stop,
    };
}
