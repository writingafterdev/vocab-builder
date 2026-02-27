// Stub file for archived live session page
// The actual implementation was removed but the archive still references it

export function useGeminiLive(_config?: Record<string, unknown>) {
    return {
        connect: () => { },
        disconnect: () => { },
        isConnected: false,
        isRecording: false,
        isSpeaking: false,
        transcript: '',
        userTranscript: '',
        messages: [] as unknown[],
        sendMessage: (_msg: string) => { },
        sessionState: 'idle',
        analysis: null,
        scores: null,
        toggleRecording: () => { },
        resetSession: () => { },
        error: null,
        startSession: async () => { },
        stopSession: async () => { },
        duration: 0,
    };
}
