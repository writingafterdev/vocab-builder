'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EditorialLoader } from '@/components/ui/editorial-loader';

// Conversation script - each message in the flow
type MessageType = 'harry' | 'user';
type TriggerType = 'auto' | 'interaction';

interface Message {
    id: number;
    type: MessageType;
    text: string;
    trigger: TriggerType;
    delay?: number; // delay in ms before showing (for auto triggers)
}

const conversation: Message[] = [
    // Scene 1: Introduction
    { id: 1, type: 'harry', text: "Hi, I'm Harry.", trigger: 'auto' },
    { id: 2, type: 'user', text: "Harry? I didn't ask for that. I'm here for my next English exam...", trigger: 'interaction' },
    { id: 3, type: 'harry', text: "I know, I know. Bear with me.", trigger: 'auto', delay: 1000 },

    // Scene 2: The Problem with Traditional Learning
    { id: 4, type: 'harry', text: "Let me guess — you've tried flashcards. Wordlists. Maybe Anki?", trigger: 'interaction' },
    { id: 5, type: 'user', text: "...yeah, and they never stick.", trigger: 'auto', delay: 1500 },
    { id: 6, type: 'harry', text: "That's because you were learning vocabulary. Not acquiring it.", trigger: 'auto', delay: 1500 },

    // Scene 3: Acquisition vs Learning
    { id: 7, type: 'harry', text: "Learning is memorizing definitions. It's what schools taught you.", trigger: 'interaction' },
    { id: 8, type: 'harry', text: "Acquisition is different. It's how you learned your first language — through stories, context, real usage.", trigger: 'auto', delay: 2000 },
    { id: 9, type: 'user', text: "So you're saying I should just... read more?", trigger: 'auto', delay: 2000 },
    { id: 10, type: 'harry', text: "Yes. But with intention.", trigger: 'auto', delay: 1000 },

    // Scene 4: The Method
    { id: 11, type: 'harry', text: "Here's how it works:", trigger: 'interaction' },
    { id: 12, type: 'harry', text: "You read something that actually interests you.", trigger: 'auto', delay: 1000 },
    { id: 13, type: 'harry', text: "You find a phrase that feels right. You save it.", trigger: 'auto', delay: 1500 },
    { id: 14, type: 'harry', text: "Later, you don't just review it — you use it. In conversations. In writing.", trigger: 'auto', delay: 1500 },
    { id: 15, type: 'user', text: "That sounds... actually doable.", trigger: 'auto', delay: 2000 },

    // Scene 5: The Conversational CTA
    { id: 16, type: 'harry', text: "It is. And I'll help you.", trigger: 'interaction' },
    { id: 17, type: 'harry', text: "So — want to give it a shot?", trigger: 'auto', delay: 1500 },
];

// Typing animation component
function TypeWriter({
    text,
    onComplete,
    speed = 40
}: {
    text: string;
    onComplete?: () => void;
    speed?: number;
}) {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        let index = 0;
        const interval = setInterval(() => {
            if (index < text.length) {
                setDisplayedText(text.slice(0, index + 1));
                index++;
            } else {
                clearInterval(interval);
                setIsComplete(true);
                onComplete?.();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, onComplete]);

    return (
        <span>
            {displayedText}
            {!isComplete && (
                <span className="animate-pulse">|</span>
            )}
        </span>
    );
}

// Single message component
function MessageBubble({
    message,
    onComplete,
    isTyping = true
}: {
    message: Message;
    onComplete?: () => void;
    isTyping?: boolean;
}) {
    const isHarry = message.type === 'harry';

    if (isHarry) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-2"
            >
                <p className="text-2xl md:text-4xl font-normal text-black leading-relaxed">
                    {isTyping ? (
                        <TypeWriter text={message.text} onComplete={onComplete} speed={35} />
                    ) : (
                        message.text
                    )}
                </p>
            </motion.div>
        );
    }

    // User's thoughts - fade in with subtle animation, smaller and italic
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mb-2"
            onAnimationComplete={onComplete}
        >
            <p className="text-lg md:text-2xl font-normal text-[#999] italic leading-relaxed">
                {message.text}
            </p>
        </motion.div>
    );
}

export default function LandingPage() {
    const { user, loading, signInWithGoogle } = useAuth();
    const router = useRouter();

    const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTyping, setIsTyping] = useState(false);
    const [canInteract, setCanInteract] = useState(false);
    const [showCTA, setShowCTA] = useState(false);
    const hasStarted = useRef(false);

    // Redirect if already logged in
    useEffect(() => {
        if (user && !loading) {
            router.push('/feed');
        }
    }, [user, loading, router]);

    // Start the conversation (only once)
    useEffect(() => {
        if (!hasStarted.current && currentIndex === 0 && visibleMessages.length === 0) {
            hasStarted.current = true;
            // Delay slightly to ensure component is ready
            const timer = setTimeout(() => {
                setVisibleMessages([conversation[0]]);
                setCurrentIndex(1);
                setIsTyping(true);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []);

    const showNextMessage = useCallback(() => {
        if (currentIndex >= conversation.length) {
            // Conversation complete, show CTA
            setTimeout(() => setShowCTA(true), 1000);
            return;
        }

        const nextMessage = conversation[currentIndex];
        setIsTyping(nextMessage.type === 'harry');
        setCanInteract(false);

        setVisibleMessages(prev => [...prev, nextMessage]);
        setCurrentIndex(prev => prev + 1);
    }, [currentIndex]);

    const handleMessageComplete = useCallback(() => {
        setIsTyping(false);

        // Check if there's another message that auto-triggers
        const nextIndex = currentIndex;
        if (nextIndex < conversation.length) {
            const nextMessage = conversation[nextIndex];
            if (nextMessage.trigger === 'auto') {
                setTimeout(() => {
                    showNextMessage();
                }, nextMessage.delay || 1000);
            } else {
                // Wait for user interaction
                setCanInteract(true);
            }
        } else {
            // End of conversation
            setTimeout(() => setShowCTA(true), 1000);
        }
    }, [currentIndex, showNextMessage]);

    // Handle user interactions (scroll, click, keypress)
    useEffect(() => {
        if (!canInteract) return;

        const handleInteraction = () => {
            if (canInteract) {
                showNextMessage();
            }
        };

        window.addEventListener('scroll', handleInteraction, { once: true });
        window.addEventListener('click', handleInteraction, { once: true });
        window.addEventListener('keydown', handleInteraction, { once: true });
        window.addEventListener('touchstart', handleInteraction, { once: true });

        return () => {
            window.removeEventListener('scroll', handleInteraction);
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
        };
    }, [canInteract, showNextMessage]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-black">
            {/* Main conversation area - slightly left of center */}
            <main className="min-h-screen px-8 md:px-24 lg:px-[20%] py-16 md:py-24">
                <div className="max-w-4xl">
                    {/* Messages */}
                    <AnimatePresence>
                        {visibleMessages.map((message, index) => (
                            <MessageBubble
                                key={`${index}-${message.id}`}
                                message={message}
                                isTyping={index === visibleMessages.length - 1 && isTyping && message.type === 'harry'}
                                onComplete={index === visibleMessages.length - 1 ? handleMessageComplete : undefined}
                            />
                        ))}
                    </AnimatePresence>

                    {/* Conversational CTA */}
                    <AnimatePresence>
                        {showCTA && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5 }}
                                className="mt-8"
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        signInWithGoogle();
                                    }}
                                    className="text-2xl md:text-4xl font-normal text-black hover:text-[#666] transition-colors duration-300 cursor-pointer"
                                >
                                    Yeah, let&apos;s go →
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
