/**
 * Quote Feed — DB module for RandomFacts-style quote discovery
 * 
 * Handles:
 * - Standalone quotes collection (queryable, with topics)
 * - View tracking (FIFO capped at 500)
 * - Topic preference scoring (save = boost)
 * - Topic picker onboarding state
 */

import {
    getDocument,
    setDocument,
    updateDocument,
    queryCollection,
    runQuery,
    addDocument,
    serverTimestamp,
} from '../firestore-rest';

// ─── Types ───────────────────────────────────────────────────────────

export interface QuoteBankEntry {
    id?: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    source: string;
    topic: string;
    highlightedPhrases: string[];
    sourceType: 'article' | 'generated_session';
    sessionId?: string;
    userId?: string;
    createdAt: string;
}

export interface QuoteFeedState {
    viewedQuoteIds: string[];
    topicScores: Record<string, number>;
    hasCompletedOnboarding: boolean;
    updatedAt: string;
}

// Available topics (matching import sources)
export const FEED_TOPICS = [
    { id: 'technology', label: 'Technology', emoji: '💻' },
    { id: 'science', label: 'Science', emoji: '🔬' },
    { id: 'business', label: 'Business', emoji: '💼' },
    { id: 'psychology', label: 'Psychology', emoji: '🧠' },
    { id: 'culture', label: 'Culture', emoji: '🏛' },
    { id: 'philosophy', label: 'Philosophy', emoji: '💭' },
    { id: 'world', label: 'World', emoji: '🌍' },
    { id: 'health', label: 'Health', emoji: '❤️‍🩹' },
] as const;

export type FeedTopicId = typeof FEED_TOPICS[number]['id'];

const VIEWED_CAP = 500; // FIFO cap — old quotes resurface after this many views

// ─── Quote Bank CRUD ─────────────────────────────────────────────────

/**
 * Add a quote to the standalone quotes collection
 * Returns the generated doc ID
 */
export async function addQuoteToBank(quote: Omit<QuoteBankEntry, 'id'>): Promise<string> {
    const docId = await addDocument('quotes', {
        ...quote,
        createdAt: quote.createdAt || serverTimestamp(),
    });
    return docId;
}

/**
 * Add multiple quotes to the bank (batch)
 */
export async function addQuotesToBank(quotes: Omit<QuoteBankEntry, 'id'>[]): Promise<string[]> {
    const ids: string[] = [];
    for (const quote of quotes) {
        const id = await addQuoteToBank(quote);
        ids.push(id);
    }
    return ids;
}

/**
 * Get all quotes from the bank
 */
export async function getAllQuotes(): Promise<QuoteBankEntry[]> {
    const docs = await queryCollection('quotes');
    return docs.map(doc => ({
        id: doc.id,
        text: doc.text as string,
        postId: doc.postId as string,
        postTitle: doc.postTitle as string,
        author: doc.author as string,
        source: doc.source as string,
        topic: doc.topic as string,
        highlightedPhrases: (doc.highlightedPhrases as string[]) || [],
        sourceType: (doc.sourceType as 'article' | 'generated_session') || 'article',
        sessionId: doc.sessionId as string | undefined,
        createdAt: doc.createdAt as string,
    }));
}

// ─── Feed State ──────────────────────────────────────────────────────

/**
 * Get the user's feed state (viewed IDs + topic scores + onboarding status)
 */
export async function getQuoteFeedState(userId: string): Promise<QuoteFeedState> {
    const doc = await getDocument('quote_feed_state', userId);
    
    if (!doc) {
        return {
            viewedQuoteIds: [],
            topicScores: {},
            hasCompletedOnboarding: false,
            updatedAt: serverTimestamp(),
        };
    }

    return {
        viewedQuoteIds: (doc.viewedQuoteIds as string[]) || [],
        topicScores: (doc.topicScores as Record<string, number>) || {},
        hasCompletedOnboarding: (doc.hasCompletedOnboarding as boolean) || false,
        updatedAt: (doc.updatedAt as string) || serverTimestamp(),
    };
}

// ─── View Tracking ───────────────────────────────────────────────────

/**
 * Mark quotes as viewed (FIFO capped at VIEWED_CAP)
 * Appends new IDs and trims oldest if over cap
 */
export async function markQuotesViewed(userId: string, quoteIds: string[]): Promise<void> {
    const state = await getQuoteFeedState(userId);
    
    // Append new IDs (deduplicate)
    const existingSet = new Set(state.viewedQuoteIds);
    const newIds = quoteIds.filter(id => !existingSet.has(id));
    const combined = [...state.viewedQuoteIds, ...newIds];
    
    // FIFO cap — trim oldest
    const trimmed = combined.length > VIEWED_CAP
        ? combined.slice(combined.length - VIEWED_CAP)
        : combined;

    await setDocument('quote_feed_state', userId, {
        viewedQuoteIds: trimmed,
        topicScores: state.topicScores,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        updatedAt: serverTimestamp(),
    });
}

// ─── Topic Preferences ───────────────────────────────────────────────

/**
 * Boost a topic score by 1 (called when user saves/❤️ a quote)
 */
export async function boostTopic(userId: string, topic: string): Promise<void> {
    const state = await getQuoteFeedState(userId);
    const currentScore = state.topicScores[topic] || 0;
    
    await setDocument('quote_feed_state', userId, {
        ...state,
        topicScores: {
            ...state.topicScores,
            [topic]: currentScore + 1,
        },
        updatedAt: serverTimestamp(),
    });
}

/**
 * Save topic picker selections (onboarding)
 * Each selected topic gets an initial boost of 5
 */
export async function saveTopicPickerChoices(userId: string, selectedTopics: string[]): Promise<void> {
    const state = await getQuoteFeedState(userId);
    
    const topicScores: Record<string, number> = { ...state.topicScores };
    for (const topic of selectedTopics) {
        topicScores[topic] = (topicScores[topic] || 0) + 5;
    }

    await setDocument('quote_feed_state', userId, {
        viewedQuoteIds: state.viewedQuoteIds,
        topicScores,
        hasCompletedOnboarding: true,
        updatedAt: serverTimestamp(),
    });
}

// ─── Smart Feed Algorithm ────────────────────────────────────────────

const MAX_PER_TOPIC = 4; // Diversity cap
const FEED_SIZE = 15;

/**
 * Get personalized quote feed for a user
 * Filters viewed, scores by topic preference, caps topic diversity
 * NEW: Boosts quotes that contain the user's savedPhrases for Passive Learning
 */
export async function getPersonalizedFeed(userId: string, savedPhrases: string[] = []): Promise<{
    quotes: QuoteBankEntry[];
    needsOnboarding: boolean;
}> {
    const [state, allQuotes] = await Promise.all([
        getQuoteFeedState(userId),
        getAllQuotes(),
    ]);

    // Check onboarding
    if (!state.hasCompletedOnboarding) {
        return { quotes: [], needsOnboarding: true };
    }

    // Filter out viewed quotes
    const viewedSet = new Set(state.viewedQuoteIds);
    let candidates = allQuotes.filter(q => q.id && !viewedSet.has(q.id));

    // If too few unviewed, allow oldest-viewed to resurface
    if (candidates.length < FEED_SIZE) {
        const viewedQuotes = allQuotes.filter(q => q.id && viewedSet.has(q.id));
        // Add oldest-viewed first (they're at the beginning of the FIFO array)
        candidates = [...candidates, ...viewedQuotes];
    }

    // Score each quote by topic preference AND saved phrases
    const scored = candidates.map(q => {
        let score = state.topicScores[q.topic] || 0;
        let highlightedPhrases = [...(q.highlightedPhrases || [])];

        // ─── Passive Learning Boost ───
        // If the quote contains any of the user's saved phrases, boost it massively
        const quoteTextLower = q.text.toLowerCase();
        for (const phrase of savedPhrases) {
            if (quoteTextLower.includes(phrase)) {
                // Extension B: The Author Penalty
                // Do not apply the boost if the quote came from a session generated by this user
                if (q.sourceType === 'generated_session' && q.userId === userId) {
                    // Skip the +100 boost, but still highlight the phrase if they find it naturally
                } else {
                    score += 100; // Massive algorithmic boost
                }

                if (!highlightedPhrases.includes(phrase)) {
                    highlightedPhrases.push(phrase);
                }
            }
        }

        return {
            quote: { ...q, highlightedPhrases },
            score,
        };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply topic diversity cap
    const topicCounts: Record<string, number> = {};
    const result: QuoteBankEntry[] = [];

    for (const { quote } of scored) {
        if (result.length >= FEED_SIZE) break;
        
        const count = topicCounts[quote.topic] || 0;
        if (count >= MAX_PER_TOPIC) continue; // Skip — too many of this topic
        
        topicCounts[quote.topic] = count + 1;
        result.push(quote);
    }

    // Shuffle within score tiers for variety (shuffle bottom 2/3 of results)
    const boostCount = Math.ceil(result.length / 3);
    const boosted = result.slice(0, boostCount);
    const rest = result.slice(boostCount);
    
    // Fisher-Yates shuffle on the rest
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    return {
        quotes: [...boosted, ...rest],
        needsOnboarding: false,
    };
}
