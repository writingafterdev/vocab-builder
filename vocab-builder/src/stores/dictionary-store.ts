'use client';

import { create } from 'zustand';

export interface DictionaryPopupState {
    phrase: string;
    meaning: string;
    register?: string | string[];
    nuance?: string | string[];
    context?: string;
    contextTranslation?: string;
    pronunciation?: string;
    topic?: string | string[];
    subtopic?: string | string[];
    isHighFrequency?: boolean;
}

interface DictionaryStore {
    // ── Popup state ──
    popup: DictionaryPopupState | null;
    bounceKey: number;
    isSaved: boolean;
    lastSaveMessage: string | null;

    // ── Popup actions ──
    openPopup: (phrase: string, context: string, userId: string, userEmail: string) => void;
    openPopupDirect: (data: DictionaryPopupState) => void;
    updatePopup: (data: Partial<DictionaryPopupState>) => void;
    dismissPopup: () => void;
    markSaved: () => void;
    savePhrase: () => Promise<void>;

    // ── Recent lookups (session-level, unsaved) ──
    recentLookups: DictionaryPopupState[];

    // ── Review cards ──
    reviewOpen: boolean;
    reviewCards: DictionaryPopupState[];
    toggleReview: () => void;
    loadReviewCards: (text: string, userId: string) => Promise<void>;

    // ── User context (set once from layout) ──
    userId: string | null;
    userEmail: string | null;
    setUser: (userId: string, userEmail: string) => void;
}

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
    // ── Initial state ──
    popup: null,
    bounceKey: 0,
    isSaved: false,
    lastSaveMessage: null,
    reviewOpen: false,
    reviewCards: [],
    recentLookups: [],
    userId: null,
    userEmail: null,

    setUser: (userId, userEmail) => set({ userId, userEmail }),

    // ── Open the popup and trigger AI lookup ──
    openPopup: async (phrase, context, userId, userEmail) => {
        const current = get().popup;

        // Same phrase clicked again while popup is still showing
        if (current?.phrase.toLowerCase() === phrase.toLowerCase()) {
            if (current.meaning && current.meaning !== 'Looking up...' && !current.meaning.startsWith('Lookup failed')) {
                // Already have full data — just bounce the card
                set(s => ({ bounceKey: s.bounceKey + 1 }));
                return;
            }
            // Still loading or failed — fall through to re-fetch
        }

        // Check session cache first (recentLookups) before hitting the API
        const cached = get().recentLookups.find(
            r => r.phrase.toLowerCase() === phrase.toLowerCase()
        );
        if (cached && cached.meaning && cached.meaning !== 'Looking up...') {
            // Restore from session cache — has all attributes including register/nuance
            set({
                popup: { ...cached, context: context || cached.context },
                bounceKey: 0,
                isSaved: false,
            });
            return;
        }

        // Show immediately with "Looking up..." placeholder
        set({
            popup: {
                phrase,
                meaning: 'Looking up...',
                context,
            },
            bounceKey: 0,
            isSaved: false,
        });

        // Fetch from API (cache-first via phraseDictionary)
        try {
            const res = await fetch('/api/user/lookup-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({ phrase, context }),
            });

            if (res.ok) {
                const json = await res.json();
                const data = json.data || json;
                const current = get().popup;

                // Only update if still showing the same phrase
                if (current?.phrase.toLowerCase() === phrase.toLowerCase()) {
                    const lookedUp: DictionaryPopupState = {
                        phrase: current.phrase,
                        meaning: data.meaning || current.meaning,
                        register: data.register,
                        nuance: data.nuance,
                        context: data.context || current.context,
                        contextTranslation: data.contextTranslation,
                        pronunciation: data.pronunciation,
                        topic: data.topic,
                        subtopic: data.subtopic,
                        isHighFrequency: data.isHighFrequency,
                    };

                    // Track in recent lookups (session-level, deduped, capped at 20)
                    // AND immediately update reviewCards so the pill count updates
                    set(s => {
                        const existing = s.recentLookups.filter(
                            r => r.phrase.toLowerCase() !== phrase.toLowerCase()
                        );
                        const newRecentLookups = [lookedUp, ...existing].slice(0, 20);
                        const validReviewCards = newRecentLookups.filter(
                            r => r.meaning && r.meaning !== 'Looking up...' && !r.meaning.startsWith('Lookup failed')
                        );
                        return {
                            popup: lookedUp,
                            recentLookups: newRecentLookups,
                            reviewCards: validReviewCards,
                        };
                    });
                }
            }
        } catch (err) {
            console.error('Dictionary lookup failed:', err);
            // Reset to allow retry
            const current = get().popup;
            if (current?.meaning === 'Looking up...' && current?.phrase.toLowerCase() === phrase.toLowerCase()) {
                set({ popup: { ...current, meaning: 'Lookup failed. Tap again to retry.' } });
            }
        }
    },

    // ── Open popup with already-resolved data (no API call) ──
    openPopupDirect: (data) => {
        // Also add to recentLookups so session cache is populated
        set(s => {
            const existing = s.recentLookups.filter(
                r => r.phrase.toLowerCase() !== data.phrase.toLowerCase()
            );
            const newRecentLookups = [data, ...existing].slice(0, 20);
            return {
                popup: data,
                bounceKey: 0,
                isSaved: false,
                lastSaveMessage: null,
                recentLookups: newRecentLookups,
            };
        });
    },

    updatePopup: (data) => {
        set(s => ({
            popup: s.popup ? { ...s.popup, ...data } : null,
        }));
    },

    dismissPopup: () => set({ popup: null, bounceKey: 0, isSaved: false, lastSaveMessage: null }),

    markSaved: () => set({ isSaved: true }),

    // ── Save the current popup phrase to vocab bank ──
    savePhrase: async () => {
        const { popup, userId, userEmail } = get();
        if (!popup || !userId || !userEmail) return;

        try {
            const res = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({
                    phrase: popup.phrase,
                    meaning: popup.meaning,
                    context: popup.context || '',
                    register: popup.register || 'consultative',
                    nuance: popup.nuance,
                    topics: popup.topic
                        ? Array.isArray(popup.topic) ? popup.topic : [popup.topic]
                        : [],
                    subtopics: popup.subtopic
                        ? Array.isArray(popup.subtopic) ? popup.subtopic : [popup.subtopic]
                        : [],
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.isDuplicate) {
                    // Already saved — mark as saved but relay the message
                    set({ isSaved: true, lastSaveMessage: data.message || 'Already saved!' });
                } else {
                    set({ isSaved: true, lastSaveMessage: null });
                }
            } else {
                const data = await res.json();
                console.error('Save failed:', data.error);
            }
        } catch (err) {
            console.error('Save phrase error:', err);
        }
    },

    // ── Review cards ──
    toggleReview: () => set(s => ({ reviewOpen: !s.reviewOpen })),

    loadReviewCards: async (_text, _userId) => {
        // Show ALL phrases looked up in THIS session
        const { recentLookups } = get();
        const valid = recentLookups
            .filter(r => r.meaning && r.meaning !== 'Looking up...' && !r.meaning.startsWith('Lookup failed'))
            .slice(0, 20);

        set({ reviewCards: valid });
    },
}));
