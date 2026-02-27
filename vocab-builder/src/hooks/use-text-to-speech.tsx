'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface UseTTSReturn {
    speak: (text: string) => void;
    stop: () => void;
    isSpeaking: boolean;
    isSupported: boolean;
}

export function useTextToSpeech(): UseTTSReturn {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    useEffect(() => {
        setIsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    }, []);

    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    const stop = useCallback(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
    }, []);

    const speak = useCallback((text: string) => {
        if (!isSupported || !text.trim()) return;

        // Skip Vietnamese text
        const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        if (vietnameseRegex.test(text)) return;

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Try to find English voice
        const voices = window.speechSynthesis.getVoices();
        const englishVoice =
            voices.find(v => v.name === 'Google US English') ||
            voices.find(v => v.name === 'Samantha') ||
            voices.find(v => v.name === 'Alex') ||
            voices.find(v => v.lang === 'en-US') ||
            voices.find(v => v.lang.startsWith('en'));

        if (englishVoice) {
            utterance.voice = englishVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [isSupported]);

    return { speak, stop, isSpeaking, isSupported };
}

// Simple component for inline use
export function SpeakButton({
    text,
    className = '',
    size = 'sm'
}: {
    text: string;
    className?: string;
    size?: 'sm' | 'md';
}) {
    const { speak, stop, isSpeaking, isSupported } = useTextToSpeech();

    if (!isSupported) return null;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isSpeaking) {
            stop();
        } else {
            speak(text);
        }
    };

    const sizeClasses = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
    const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

    return (
        <button
            onClick={handleClick}
            className={`inline-flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors ${sizeClasses} ${className}`}
            title={isSpeaking ? 'Stop' : 'Listen'}
            type="button"
        >
            {isSpeaking ? <VolumeX className={iconSize} /> : <Volume2 className={iconSize} />}
        </button>
    );
}
