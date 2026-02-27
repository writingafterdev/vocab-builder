'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import CollocationSelectionModal from './collocation-selection-modal';

interface SavePhraseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { phrase: string; context: string; meaning: string; register?: 'casual' | 'consultative' | 'formal'; nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative' }) => void;
    initialPhrase: string;
    initialContext: string;
    userId?: string;
    userEmail?: string;
}

function SavePhraseModal({
    isOpen,
    onClose,
    onSave,
    initialPhrase,
    initialContext,
    userId,
    userEmail
}: SavePhraseModalProps) {
    const [phrase, setPhrase] = useState(initialPhrase);
    const [context, setContext] = useState(initialContext);
    const [meaning, setMeaning] = useState('');
    const [register, setRegister] = useState<'casual' | 'consultative' | 'formal'>('consultative');
    const [nuance, setNuance] = useState<'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative'>('neutral');
    const [generatingMeaning, setGeneratingMeaning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setPhrase(initialPhrase);
        setContext(initialContext);
        setMeaning('');
        setRegister('consultative');
        setNuance('neutral');
    }, [initialPhrase, initialContext]);

    const handleGenerateMeaning = async () => {
        setGeneratingMeaning(true);
        try {
            const response = await fetch('/api/user/lookup-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || '',
                    'x-user-email': userEmail || '',
                },
                body: JSON.stringify({
                    phrase: phrase.trim(),
                    context: context.trim()
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate meaning');
            }

            const result = await response.json();
            const data = result.data || result;
            setMeaning(data.meaning || 'Could not generate meaning');
            if (data.register) {
                // Handle array or single value
                const reg = Array.isArray(data.register) ? data.register[0] : data.register;
                setRegister(reg);
            }
            if (data.nuance) {
                // Handle array or single value
                const nua = Array.isArray(data.nuance) ? data.nuance[0] : data.nuance;
                setNuance(nua);
            }
        } catch (error) {
            console.error('Error generating meaning:', error);
            setMeaning('A phrase or expression commonly used in English.');
        }
        setGeneratingMeaning(false);
    };

    const handleSave = async () => {
        if (!phrase.trim()) {
            toast.error('Please enter a phrase');
            return;
        }
        if (!meaning.trim()) {
            toast.error('Please add a meaning');
            return;
        }
        if (isSaving) return;

        setIsSaving(true);
        try {
            await Promise.resolve(onSave({
                phrase: phrase.trim(),
                context: context.trim(),
                meaning: meaning.trim(),
                register,
                nuance
            }));
            onClose();
            toast.success('Phrase saved to Vocab Bank!');
        } finally {
            setIsSaving(false);
        }
    };

    const getRegisterColor = (r: string) => {
        switch (r) {
            case 'casual': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
            case 'formal': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
            default: return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
        }
    };

    const getRegisterLabel = (r: string) => {
        switch (r) {
            case 'casual': return '🗣️ Casual';
            case 'formal': return '✍️ Formal';
            default: return '↔️ Consultative';
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md font-sans">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookmarkPlus className="h-5 w-5" />
                        Save Phrase
                    </DialogTitle>
                    <DialogDescription>
                        Add this phrase to your vocabulary bank for learning.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Phrase */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium">Phrase</label>
                            {generatingMeaning ? (
                                <span className="text-xs text-muted-foreground animate-pulse">Analyzing...</span>
                            ) : (
                                <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRegisterColor(register)}`}>
                                    {getRegisterLabel(register)}
                                </div>
                            )}
                        </div>
                        <Input
                            value={phrase}
                            onChange={(e) => setPhrase(e.target.value)}
                            placeholder="Enter phrase..."
                        />
                    </div>

                    {/* Context */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Context</label>
                        <Textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="The sentence where you found this phrase..."
                            className="resize-none"
                            rows={2}
                        />
                    </div>

                    {/* Meaning */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Meaning</label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleGenerateMeaning}
                                disabled={generatingMeaning || !phrase.trim()}
                                className="text-xs"
                            >
                                {generatingMeaning ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        Generate with AI
                                    </>
                                )}
                            </Button>
                        </div>
                        <Textarea
                            value={meaning}
                            onChange={(e) => setMeaning(e.target.value)}
                            placeholder="What does this phrase mean?"
                            className="resize-none"
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                            'Save to Vocab Bank'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface FloatingActionButtonProps {
    position: { x: number; y: number };
    onSave: () => void;
}

function FloatingActionButton({ position, onSave }: FloatingActionButtonProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
            }}
        >
            <Button
                size="sm"
                onClick={onSave}
                className="shadow-lg gap-2 bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200 font-sans"
            >
                <BookmarkPlus className="h-4 w-4" />
                Save Phrase
            </Button>
        </motion.div>
    );
}

interface TextHighlighterProps {
    children: ReactNode;
    userId?: string;
    userEmail?: string;
    userName?: string;
    userUsername?: string;
    onPhraseSaved?: (data: { phrase: string; context: string; meaning: string; register?: 'casual' | 'consultative' | 'formal'; nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative' }) => void;
    onVocabLookup?: (phrase: string, context: string) => void; // New: for sidebar mode
}

export default function TextHighlighter({
    children,
    userId,
    userEmail,
    userName,
    userUsername,
    onPhraseSaved,
    onVocabLookup
}: TextHighlighterProps) {
    const { profile } = useAuth();
    const [selectedText, setSelectedText] = useState('');
    const [selectedContext, setSelectedContext] = useState('');
    const [showFloatingButton, setShowFloatingButton] = useState(false);
    const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });
    const [showModal, setShowModal] = useState(false);
    const [showCollocationModal, setShowCollocationModal] = useState(false);


    const handleSelection = useCallback(() => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed) {
            setShowFloatingButton(false);
            return;
        }

        const text = selection.toString().trim();

        if (text.length < 2 || text.length > 100) {
            setShowFloatingButton(false);
            return;
        }

        // Get the bounding rect of the selection
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Get context - traverse up to find meaningful container
        let contextElement = range.commonAncestorContainer.parentElement;
        let context = '';

        // Keep going up until we find an element with substantial text
        while (contextElement && context.length < 50) {
            context = contextElement.textContent?.trim() || '';
            contextElement = contextElement.parentElement;
            // Stop at article/section/div containers
            if (contextElement?.tagName === 'ARTICLE' ||
                contextElement?.tagName === 'SECTION' ||
                contextElement?.tagName === 'P' ||
                (contextElement?.className && contextElement.className.includes('content'))) {
                context = contextElement.textContent?.trim() || context;
                break;
            }
        }

        // Extract just the sentence containing the selected text (if possible)
        if (context.length > 200) {
            // Find the sentence containing the selection
            const sentences = context.split(/[.!?]+/);
            const matchingSentence = sentences.find(s => s.toLowerCase().includes(text.toLowerCase()));
            if (matchingSentence) {
                context = matchingSentence.trim() + '.';
            } else {
                // Fallback: get text around the selection
                const idx = context.toLowerCase().indexOf(text.toLowerCase());
                if (idx >= 0) {
                    const start = Math.max(0, idx - 100);
                    const end = Math.min(context.length, idx + text.length + 100);
                    context = (start > 0 ? '...' : '') + context.slice(start, end).trim() + (end < context.length ? '...' : '');
                }
            }
        }

        setSelectedText(text);
        setSelectedContext(context.slice(0, 300)); // Increased limit
        setButtonPosition({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
        });
        setShowFloatingButton(true);
    }, []);

    const handleClickOutside = useCallback((e: MouseEvent) => {
        // Check if click is outside the floating button
        const target = e.target as HTMLElement;
        if (!target.closest('[data-floating-button]')) {
            setShowFloatingButton(false);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('mouseup', handleSelection);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mouseup', handleSelection);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleSelection, handleClickOutside]);

    const handleOpenModal = () => {
        setShowFloatingButton(false);

        // If sidebar mode is enabled (onVocabLookup provided), use that instead of modal
        if (onVocabLookup) {
            onVocabLookup(selectedText, selectedContext);
            setSelectedText('');
            setSelectedContext('');
            return;
        }

        // Otherwise show collocation selection modal (original behavior)
        setShowCollocationModal(true);
    };

    const handleCollocationsSave = async (data: {
        rootWord: string;
        meaning: string;
        mode: 'spoken' | 'written' | 'neutral';
        topics: string[];
        children: Array<{
            type: 'collocation' | 'phrasal_verb';
            phrase: string;
            meaning: string;
            mode: 'spoken' | 'written' | 'neutral';
            topics: string[];
        }>;
    }) => {
        if (!userId || !userEmail) {
            toast.error('Please log in to save phrases');
            return;
        }

        try {
            // Save via REST API (hierarchical structure)
            const response = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({
                    phrase: data.rootWord,
                    meaning: data.meaning,
                    context: selectedContext,
                    mode: data.mode,
                    topics: data.topics,
                    children: data.children,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                if (error.error?.includes('Daily limit')) {
                    toast.error('Daily save limit reached');
                } else {
                    throw new Error(error.error || 'Failed to save');
                }
                return;
            }

            const childCount = data.children.length;
            if (childCount > 0) {
                toast.success(`Saved "${data.rootWord}" with ${childCount} expression(s)!`);
            } else {
                toast.success(`Saved "${data.rootWord}"!`);
            }

            // Notify parent
            onPhraseSaved?.({
                phrase: data.rootWord,
                context: selectedContext,
                meaning: data.meaning,
                register: data.mode === 'spoken' ? 'casual' : data.mode === 'written' ? 'formal' : 'consultative'
            });

            setSelectedText('');
            setSelectedContext('');
        } catch (error) {
            console.error('Error saving phrase:', error);
            toast.error('Failed to save phrase');
        }
    };

    const handleSave = async (data: { phrase: string; context: string; meaning: string; register?: 'casual' | 'consultative' | 'formal'; nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative' }) => {
        // Require user to be logged in
        if (!userId || !userEmail) {
            toast.error('Please log in to save phrases');
            return;
        }

        try {
            // Call API endpoint for server-side saving and counting
            const response = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({
                    phrase: data.phrase,
                    meaning: data.meaning,
                    context: data.context,
                    register: data.register || 'consultative',
                    nuance: data.nuance || 'neutral',
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    toast.error(result.error || 'Daily limit reached!');
                } else {
                    toast.error(result.error || 'Failed to save phrase');
                }
                return;
            }

            // Notify parent component
            onPhraseSaved?.(data);

            const remaining = result.remaining ?? 15;
            if (remaining > 0) {
                toast.info(`Phrase saved! ${remaining} saves remaining today.`);
            } else {
                toast.info(`Phrase saved! Daily limit reached. Come back tomorrow!`);
            }

            // Close dialog
            setSelectedText('');
            setSelectedContext('');
        } catch (error) {
            console.error('Error saving phrase:', error);
            toast.error('Failed to save phrase');
        }
    };

    return (
        <>
            {children}

            <AnimatePresence>
                {showFloatingButton && (
                    <div data-floating-button>
                        <FloatingActionButton
                            position={buttonPosition}
                            onSave={handleOpenModal}
                        />
                    </div>
                )}
            </AnimatePresence>

            <SavePhraseModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleSave}
                initialPhrase={selectedText}
                initialContext={selectedContext}
                userId={userId}
                userEmail={userEmail}
            />

            <CollocationSelectionModal
                isOpen={showCollocationModal}
                onClose={() => setShowCollocationModal(false)}
                onSave={handleCollocationsSave}
                highlightedWord={selectedText}
                context={selectedContext}
                userId={userId}
                userEmail={userEmail}
            />
        </>
    );
}
