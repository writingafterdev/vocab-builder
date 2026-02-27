'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Register, Nuance, SocialDistance } from '@/lib/db/types';

export interface SessionVocabItem {
    id: string;
    phrase: string;
    phonetic?: string;
    audioUrl?: string;
    meanings: Array<{
        partOfSpeech: string;
        definitions: Array<{
            definition: string;
            example?: string;
        }>;
    }>;
    commonUsages?: Array<{
        phrase: string;
        meaning: string;
        example?: string;
        type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
    }>;
    // Component words breakdown (for phrases)
    componentWords?: Array<{
        word: string;
        meaning: string;
        partOfSpeech: string;
        isHighFrequency: boolean;
    }>;
    context?: string;
    sentenceTranslation?: string;
    yPosition?: number;
    isLoading?: boolean;
    isEnriching?: boolean;
    isSaving?: boolean;
    isSaved?: boolean;
    isLoadingTags?: boolean;
    // AI-suggested tags - support both single values and arrays
    suggestedRegister?: Register | Register[];
    suggestedNuance?: Nuance | Nuance[];
    suggestedSocialDistance?: SocialDistance[];  // NEW
    suggestedTopic?: string | string[];
    suggestedTopicLabel?: string;
    suggestedSubtopic?: string | string[];
    suggestedSubtopicLabel?: string;
    tagReasoning?: string;
    source: 'dictionary' | 'ai' | 'prebuilt';
    timestamp: number;
}

// Prebuilt phrase data from article extraction
export interface ExtractedPhraseData {
    phrase: string;
    meaning: string;
    example?: string;
    sentenceTranslation?: string;
    yPosition?: number;
    // Support both single values and arrays
    register?: Register | Register[];
    nuance?: Nuance | Nuance[];
    socialDistance?: SocialDistance[];  // NEW
    topic?: string | string[];
    subtopic?: string | string[];
    isHighFrequency?: boolean;
    commonUsages?: Array<{
        phrase: string;
        meaning: string;
        example?: string;
        type?: string;
        register?: Register | Register[];
        nuance?: Nuance | Nuance[];
    }>;
    // Component words for phrase breakdown
    componentWords?: Array<{
        word: string;
        meaning: string;
        partOfSpeech: string;
        isHighFrequency: boolean;
    }>;
}

interface UseSessionVocabReturn {
    vocabItems: SessionVocabItem[];
    addVocab: (phrase: string, context?: string) => Promise<SessionVocabItem | null>;
    addVocabWithData: (data: ExtractedPhraseData, context?: string) => SessionVocabItem; // For prebuilt data
    updateVocab: (id: string, updates: Partial<SessionVocabItem>) => void;
    getVocab: (phrase: string) => SessionVocabItem | undefined;
    markAsSaved: (id: string) => void;
    clearSession: () => void;
}

const STORAGE_KEY_PREFIX = 'session-vocab-';

export function useSessionVocab(
    userId?: string,
    userEmail?: string,
    postId?: string
): UseSessionVocabReturn {
    const [vocabItems, setVocabItems] = useState<SessionVocabItem[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        if (!postId) {
            setIsInitialized(true);
            return;
        }

        try {
            const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${postId}`);
            if (stored) {
                const parsed = JSON.parse(stored) as SessionVocabItem[];
                // Filter out any items that were still loading when saved
                const validItems = parsed.filter(item => !item.isLoading);
                setVocabItems(validItems);
            }
        } catch (e) {
            console.error('Failed to load session vocab:', e);
        }
        setIsInitialized(true);
    }, [postId]);

    // Sync isSaved state with actual database (in case phrases were deleted elsewhere)
    useEffect(() => {
        if (!userId || !isInitialized || vocabItems.length === 0) return;

        const syncSavedState = async () => {
            try {
                // Fetch user's actual saved phrases from database
                const response = await fetch(`/api/user/saved-phrases?userId=${userId}`);
                if (!response.ok) return;

                const savedPhrases: { phrase: string; baseForm?: string }[] = await response.json();
                const savedPhrasesLower = savedPhrases.map(p =>
                    (p.baseForm || p.phrase).toLowerCase()
                );

                // Update isSaved for each vocab item based on actual database state
                setVocabItems(prev => prev.map(item => {
                    const phraseLower = item.phrase.toLowerCase();
                    const actuallyIsSaved = savedPhrasesLower.includes(phraseLower);

                    // Only update if there's a mismatch
                    if (item.isSaved !== actuallyIsSaved) {
                        return { ...item, isSaved: actuallyIsSaved };
                    }
                    return item;
                }));
            } catch (e) {
                console.error('Failed to sync saved state:', e);
            }
        };

        syncSavedState();
    }, [userId, isInitialized, vocabItems.length]);

    // Save to localStorage whenever vocabItems changes
    useEffect(() => {
        if (!postId || !isInitialized) return;

        try {
            // Only save items that are not still loading
            const itemsToSave = vocabItems.filter(item => !item.isLoading);
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${postId}`, JSON.stringify(itemsToSave));
        } catch (e) {
            console.error('Failed to save session vocab:', e);
        }
    }, [vocabItems, postId, isInitialized]);

    // Get existing vocab item by phrase
    const getVocab = useCallback((phrase: string): SessionVocabItem | undefined => {
        const normalizedPhrase = phrase.toLowerCase().trim();
        return vocabItems.find(v => v.phrase.toLowerCase() === normalizedPhrase);
    }, [vocabItems]);

    // Update an existing vocab item
    const updateVocab = useCallback((id: string, updates: Partial<SessionVocabItem>) => {
        setVocabItems(prev => prev.map(v =>
            v.id === id ? { ...v, ...updates } : v
        ));
    }, []);

    // Mark vocab as saved to bank
    const markAsSaved = useCallback((id: string) => {
        updateVocab(id, { isSaved: true });
    }, [updateVocab]);

    // Clear all session vocab
    const clearSession = useCallback(() => {
        setVocabItems([]);
        if (postId) {
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${postId}`);
        }
    }, [postId]);

    // Add new vocab - AI for meaning, dictionary for pronunciation only
    const addVocab = useCallback(async (
        phrase: string,
        context?: string
    ): Promise<SessionVocabItem | null> => {
        const normalizedPhrase = phrase.trim();

        // Check if already exists - return existing
        const existing = getVocab(normalizedPhrase);
        if (existing) {
            // Move to top of list
            setVocabItems(prev => [
                existing,
                ...prev.filter(v => v.id !== existing.id)
            ]);
            return existing;
        }

        // Create placeholder item
        const id = `vocab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newItem: SessionVocabItem = {
            id,
            phrase: normalizedPhrase,
            meanings: [],
            isLoading: true,
            source: 'ai', // Always use AI for meaning now
            timestamp: Date.now(),
            context,
        };

        // Add to state immediately (shows loading)
        setVocabItems(prev => [newItem, ...prev]);

        try {
            // Fetch from lookup-phrase API (comprehensive data including pronunciation)
            const response = await fetch('/api/user/lookup-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || '',
                    'x-user-email': userEmail || '',
                },
                body: JSON.stringify({ phrase: normalizedPhrase, context }),
            });

            if (!response.ok) throw new Error('Lookup failed');
            const result = await response.json();
            const aiData = result.data || result;

            // Extract pronunciation from lookup-phrase response
            const phonetic = aiData.pronunciation;
            // Note: lookup-phrase doesn't return audioUrl directly, could add later
            const audioUrl = undefined;

            const updatedItem: SessionVocabItem = {
                id,
                phrase: normalizedPhrase,
                context,
                phonetic,
                audioUrl,
                meanings: [{
                    partOfSpeech: 'phrase',
                    definitions: [{ definition: aiData.meaning }],
                }],
                commonUsages: aiData.commonUsages,
                isLoading: false,
                isEnriching: false, // lookup-phrase already includes all data
                source: 'ai',
                timestamp: Date.now(),
                // Populate suggested tags from lookup-phrase response
                suggestedRegister: aiData.register,
                suggestedNuance: aiData.nuance,
                suggestedSocialDistance: aiData.socialDistance,
                suggestedTopic: aiData.isHighFrequency ? 'high_frequency' : aiData.topic,
                suggestedSubtopic: aiData.subtopic,
            };

            setVocabItems(prev => prev.map(v => v.id === id ? updatedItem : v));

            return updatedItem;
        } catch (error) {
            console.error('Vocab lookup error:', error);
            // Remove failed item
            setVocabItems(prev => prev.filter(v => v.id !== id));
            return null;
        }
    }, [getVocab, userId, userEmail]);

    // Add vocab with prebuilt data (no API calls - instant)
    const addVocabWithData = useCallback((
        data: ExtractedPhraseData,
        context?: string
    ): SessionVocabItem => {
        const normalizedPhrase = data.phrase.trim().toLowerCase();
        const id = `vocab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create item with prebuilt data
        const newItem: SessionVocabItem = {
            id,
            phrase: data.phrase.trim(),
            context,
            yPosition: data.yPosition, // Store viewport Y position
            meanings: [{
                partOfSpeech: Array.isArray(data.register) ? data.register[0] : (data.register || 'phrase'),
                definitions: [{
                    definition: data.meaning,
                    example: data.example,
                }],
            }],
            commonUsages: data.commonUsages?.map(u => ({
                phrase: u.phrase,
                meaning: u.meaning,
                example: u.example || '',
                type: (u.type as 'collocation' | 'phrasal_verb' | 'idiom' | 'expression') || 'expression',
            })),
            componentWords: data.componentWords, // Word breakdown for phrases
            sentenceTranslation: data.sentenceTranslation,
            // Populate suggested tags from prebuilt data (no API call needed)
            suggestedRegister: data.register,
            suggestedNuance: data.nuance,
            suggestedTopic: data.isHighFrequency ? 'high_frequency' : data.topic,
            suggestedSubtopic: data.subtopic,
            suggestedSocialDistance: data.socialDistance,
            isLoading: false,
            isEnriching: false,
            isLoadingTags: false, // No API call needed, prebuilt
            source: 'prebuilt',
            timestamp: Date.now(),
        };

        // Use functional update to check for duplicates within the same render cycle
        // This prevents race conditions when multiple addVocabWithData calls happen rapidly
        let returnItem = newItem;
        setVocabItems(prev => {
            // Check if already exists in CURRENT state (not stale closure)
            const existing = prev.find(v => v.phrase.toLowerCase() === normalizedPhrase);
            if (existing) {
                // Update yPosition and move to top of list
                returnItem = { ...existing, yPosition: data.yPosition };
                return [returnItem, ...prev.filter(v => v.id !== existing.id)];
            }
            // Add new item
            return [newItem, ...prev];
        });

        return returnItem;
    }, []);

    return {
        vocabItems,
        addVocab,
        addVocabWithData,
        updateVocab,
        getVocab,
        markAsSaved,
        clearSession,
    };
}
