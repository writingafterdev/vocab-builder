import { useState, useCallback, useRef, useEffect } from 'react';

// Common shared type
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface UseRealtimeVoiceReturn {
    isConnected: boolean;
    isTalking: boolean; // User VAD status
    isAiSpeaking: boolean;
    connect: (systemContext: string) => void;
    disconnect: () => void;
    error: string | null;
}

// GLOBAL SINGLETON (Window-Attached to survive HMR)
const getGlobalSocket = () => (window as any).__GEMINI_SOCKET__;
const setGlobalSocket = (ws: WebSocket | null) => { (window as any).__GEMINI_SOCKET__ = ws; };

export function useRealtimeVoice(url: string = 'ws://localhost:8081'): UseRealtimeVoiceReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);

    // Ref to track AI speaking state inside the audio loop
    const isAiSpeakingRef = useRef(false);
    useEffect(() => {
        isAiSpeakingRef.current = isAiSpeaking;
    }, [isAiSpeaking]);

    // Helper: Float32 -> PCM16 (Base64)
    const floatToBase64PCM16 = (input: Float32Array): string => {
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        let binary = '';
        const bytes = new Uint8Array(pcm16.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    // Helper: Downsample to 16kHz
    const downsampleBuffer = (buffer: Float32Array, inputRate: number): Float32Array => {
        if (inputRate === 16000) return buffer;
        const targetRate = 16000;
        const ratio = inputRate / targetRate;
        const newLength = Math.ceil(buffer.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const offset = i * ratio;
            const next = Math.ceil(offset);
            const prev = Math.floor(offset);
            const weight = offset - prev;
            const val = buffer[prev] * (1 - weight) + (buffer[next] || buffer[prev]) * weight;
            result[i] = val;
        }
        return result;
    };

    // Helper: Upsample to Context Rate (e.g. 24k -> 48k)
    const upsampleBuffer = (buffer: Float32Array, targetRate: number): Float32Array => {
        if (targetRate === 24000) return buffer;
        const inputRate = 24000;
        const ratio = inputRate / targetRate; // e.g. 0.5
        const newLength = Math.ceil(buffer.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const offset = i * ratio;
            const next = Math.ceil(offset);
            const prev = Math.floor(offset);
            const weight = offset - prev;
            const val = buffer[prev] * (1 - weight) + (buffer[next] || buffer[prev]) * weight;
            result[i] = val;
        }
        return result;
    };

    const cleanupAudio = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioInputRef.current) {
            audioInputRef.current.disconnect();
            audioInputRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        // Stop all queued audio
        audioQueueRef.current.forEach(source => {
            try { source.stop(); } catch (e) { }
        });
        audioQueueRef.current = [];
    }, []);

    // Silence Timeout (Cost Saver)
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const disconnect = useCallback(() => {
        // Close the Global Socket (Window Attached)
        const globalWs = getGlobalSocket();
        if (globalWs) {
            console.log("[Cleanup] Closing Global Socket");
            globalWs.close();
            setGlobalSocket(null);
        }
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }
        cleanupAudio();
        setIsConnected(false);
        setIsAiSpeaking(false);
        setIsTalking(false);
    }, [cleanupAudio]);

    const resetSilenceTimeout = useCallback(() => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = setTimeout(() => {
            console.log("[Auto-Disconnect] Session timed out due to silence.");
            disconnect();
        }, 60000); // 60 seconds
    }, [disconnect]);

    // Handle Incoming Audio
    const playAudioChunk = useCallback((base64Audio: string) => {
        resetSilenceTimeout(); // Reset timer on AI speech
        try {
            const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
            const pcm16 = new Int16Array(audioData.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
                const int = pcm16[i];
                float32[i] = int >= 0 ? int / 0x7FFF : int / 0x8000;
            }

            if (!audioContextRef.current) return;
            const ctx = audioContextRef.current;

            // Manual Upsampling to System Rate (prevents playback gaps/pitch issues)
            const upsampled = upsampleBuffer(float32 as any, ctx.sampleRate);

            // Create buffer at NATIVE rate
            const buffer = ctx.createBuffer(1, upsampled.length, ctx.sampleRate);
            buffer.copyToChannel(upsampled as any, 0);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);

            const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
            // console.log(`[Audio] Sched: ${startTime.toFixed(3)}...`);

            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;

            // Track source for cancellation
            audioQueueRef.current.push(source);
            source.onended = () => {
                // console.log("[Audio] Ended"); // Too noisy
                audioQueueRef.current = audioQueueRef.current.filter(s => s !== source);
                if (ctx.currentTime >= nextStartTimeRef.current - 0.1) {
                    setIsAiSpeaking(false);
                }
            };

            setIsAiSpeaking(true);

        } catch (e) {
            console.error("Audio Decode Error", e);
        }
    }, [resetSilenceTimeout]);

    // MAIN CONNECT FUNCTION
    const connect = useCallback(async (systemContext: string) => {
        // NUCLEAR HMR CLEANUP
        const existing = getGlobalSocket();
        if (existing) {
            console.log("[Connect] Killing existing HMR Zombie Socket");
            existing.close();
            setGlobalSocket(null);
        }

        disconnect();
        setError(null);
        resetSilenceTimeout(); // Start timer on connect

        try {
            // 1. Setup Audio Input (Mic)
            // ... (rest of input setup) ...
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    // Remove forced sampleRate - let browser decide native rate (likely 44.1k or 48k)
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            // FIXED: Use Native Sample Rate (usually 44100 or 48000)
            // Forcing 24000 causes clock drift/stuttering on many systems.
            const ctx = new AudioContext();
            audioContextRef.current = ctx;
            nextStartTimeRef.current = ctx.currentTime;

            // ... (rest of audio graph) ...
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);

            const gain = ctx.createGain();
            gain.gain.value = 0;
            processor.connect(gain);
            gain.connect(ctx.destination);
            source.connect(processor); // FIXED: Source -> Processor -> Gain -> Dest

            audioInputRef.current = source;
            processorRef.current = processor;

            // 2. Setup WebSocket
            const ws = new WebSocket(url);
            setGlobalSocket(ws);

            ws.onopen = () => {
                if (getGlobalSocket() !== ws) return; // Race condition check
                console.log('GeminiLive: Connected');
                setIsConnected(true);

                // 1. Setup Message (Config) - TUNED FOR NATURAL CONVO
                const setupMsg = {
                    setup: {
                        model: "models/gemini-2.0-flash-exp",
                        generation_config: {
                            response_modalities: ["AUDIO"],
                            speech_config: {
                                voice_config: { prebuilt_voice_config: { voice_name: "Puck" } }
                            }
                        },
                        system_instruction: {
                            parts: [{ text: systemContext + " \n\nIMPORTANT: Be conversational, natural, and brief. Do NOT monologue. Listen to the user. Stop speaking immediately if interrupted." }]
                        }
                    }
                };
                ws.send(JSON.stringify(setupMsg));

                // 2. Trigger Initial Response (Force AI to speak first)
                const triggerMsg = {
                    client_content: {
                        turns: [{
                            role: "user",
                            parts: [{ text: "Start" }]
                        }],
                        turn_complete: true
                    }
                };
                ws.send(JSON.stringify(triggerMsg));
            };
            // ... (rest of handlers)

            ws.onmessage = async (event) => {
                resetSilenceTimeout(); // Reset on any message (keepalive or audio)
                let data;
                try {
                    if (event.data instanceof Blob) {
                        data = JSON.parse(await event.data.text());
                    } else {
                        data = JSON.parse(event.data);
                    }
                } catch (e) { return; }

                // Audio Output
                if (data.serverContent?.modelTurn?.parts) {
                    for (const part of data.serverContent.modelTurn.parts) {
                        if (part.inlineData?.mimeType.startsWith('audio/')) {
                            // const len = part.inlineData.data.length;
                            // console.log(`[RX] Audio Chunk: ${len} chars`);
                            playAudioChunk(part.inlineData.data);
                        }
                    }
                }

                // Interruption Handling (Server detects user speech)
                if (data.serverContent?.interrupted) {
                    console.log("Gemini: Interrupted");

                    // 1. CLEAR AUDIO QUEUE IMMEDIATELY
                    // We must stop all currently playing nodes to shut up the AI.
                    audioQueueRef.current.forEach(source => {
                        try { source.stop(); } catch (e) { }
                    });
                    audioQueueRef.current = []; // Nuke the reference

                    // 2. Reset Audio Context Time tracking
                    // This prevents future chunks from being scheduled way in the future
                    if (audioContextRef.current) {
                        nextStartTimeRef.current = audioContextRef.current.currentTime;
                    }

                    setIsAiSpeaking(false);
                }
            };

            ws.onerror = (e) => {
                console.error(e);
                setError("Connection Failed");
                disconnect();
            };

            ws.onclose = () => {
                console.log("GeminiLive: Closed");
                disconnect();
            };

            // 3. Audio Processing Loop
            processor.onaudioprocess = (e) => {
                if (ws.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // Simple VAD
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                const isTalkingNow = rms > 0.02; // Threshold
                setIsTalking(isTalkingNow);

                if (isTalkingNow) resetSilenceTimeout(); // Reset timer if user speaking

                // Echo Gating Logic:
                // If AI is speaking, we usually mute to prevent echo loops.
                // BUT we must allow LOUD interruptions ("Stop!").
                // If AI is speaking AND volume is low (Echo), drop it.
                // If AI is speaking AND volume is high (User Interrupt), send it.
                if (isAiSpeakingRef.current && rms < 0.1) {
                    return;
                }

                // Convert to Base64 (PCM16)
                // Gemini expects 16kHz usually. If we send 48k it sounds like slow-motion demons.
                const downsampled = downsampleBuffer(inputData, ctx.sampleRate);
                const base64 = floatToBase64PCM16(downsampled);

                // Send Realtime Input
                // Gemini Bidi Protocol: "realtime_input"
                // console.log(`[TX] Input ${base64.length} chars`); // Too noisy to log every frame?
                const msg = {
                    realtime_input: {
                        media_chunks: [{
                            mime_type: "audio/pcm",
                            data: base64
                        }]
                    }
                };
                ws.send(JSON.stringify(msg));
            };

        } catch (e) {
            console.error(e);
            setError("Mic Access Denied");
        }
    }, [url, disconnect, playAudioChunk, resetSilenceTimeout]);

    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    return {
        isConnected,
        isTalking,
        isAiSpeaking,
        connect,
        disconnect,
        error
    };
}
