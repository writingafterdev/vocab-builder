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
} from '../appwrite/database';

// ─── Types ───────────────────────────────────────────────────────────

export interface QuoteBankEntry {
    id?: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    source: string;
    topic: string;
    tags?: string[];
    highlightedPhrases: string[];
    sourceType: 'article' | 'generated_session' | 'generated_fact';
    sessionId?: string;
    userId?: string;
    createdAt: string;
    vocabularyData?: any; // Pre-generated metadata
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
const PHRASE_BOOST_CAP = 15; // Max boost from saved-phrase presence (was 100, drowned out topics)
const EXPLORATION_RATIO = 0.2; // 20% of feed slots reserved for low-scored "discovery" topics
const DECAY_FACTOR = 0.92; // Applied to all scores on each session (~halves after 8 sessions)

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
    const docs = await queryCollection('quotes', { limit: 500 });
    return docs.map(doc => ({
        id: doc.id,
        text: doc.text as string,
        postId: doc.postId as string,
        postTitle: doc.postTitle as string,
        author: doc.author as string,
        source: doc.source as string,
        topic: doc.topic as string,
        tags: (doc.tags as string[]) || [],
        highlightedPhrases: (doc.highlightedPhrases as string[]) || [],
        sourceType: (doc.sourceType as 'article' | 'generated_session' | 'generated_fact') || 'article',
        sessionId: doc.sessionId as string | undefined,
        createdAt: doc.createdAt as string,
        vocabularyData: doc.vocabularyData,
    }));
}

// ─── Feed State ──────────────────────────────────────────────────────

/**
 * Get the user's feed state (viewed IDs + topic scores + onboarding status)
 */
export async function getQuoteFeedState(userId: string, idToken?: string): Promise<QuoteFeedState> {
    const doc = await getDocument('quote_feed_state', userId, idToken);
    
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
export async function markQuotesViewed(userId: string, quoteIds: string[], idToken?: string): Promise<void> {
    const state = await getQuoteFeedState(userId, idToken);
    
    // Append new IDs (deduplicate)
    const existingSet = new Set(state.viewedQuoteIds);
    const newIds = quoteIds.filter(id => !existingSet.has(id));
    const combined = [...state.viewedQuoteIds, ...newIds];
    
    // FIFO cap — trim oldest
    const trimmed = combined.length > VIEWED_CAP
        ? combined.slice(combined.length - VIEWED_CAP)
        : combined;

    await setDocument('quote_feed_state', userId, {
        userId,
        viewedQuoteIds: trimmed,
        topicScores: state.topicScores,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        updatedAt: serverTimestamp(),
    }, idToken);
}

// ─── Topic Preferences ───────────────────────────────────────────────

/**
 * Boost (or penalize) a topic score.
 * Positive weight = user liked content in this topic.
 * Negative weight = user quickly skipped content (capped at -2 per call to prevent rage-skips).
 * Also applies score decay on every call so preferences naturally fade.
 */
export async function boostTopic(userId: string, topic: string, weight: number = 1, idToken?: string, tags: string[] = []): Promise<void> {
    const state = await getQuoteFeedState(userId, idToken);
    
    // Apply global decay to ALL scores first (preferences fade naturally)
    const updatedScores: Record<string, number> = {};
    for (const [key, val] of Object.entries(state.topicScores)) {
        const decayed = val * DECAY_FACTOR;
        // Prune near-zero scores to keep the object lean
        if (Math.abs(decayed) > 0.1) {
            updatedScores[key] = Math.round(decayed * 100) / 100;
        }
    }
    
    // Clamp negative weight to prevent rage-skip abuse
    const clampedWeight = weight < 0 ? Math.max(weight, -2) : weight;
    
    // Boost the broad UI topic
    updatedScores[topic] = (updatedScores[topic] || 0) + clampedWeight;
    
    // Also boost/penalize every specific micro-tag attached to this fact/quote
    for (const tag of tags) {
        if (!tag) continue;
        const normalizedTag = tag.toLowerCase().trim();
        updatedScores[normalizedTag] = (updatedScores[normalizedTag] || 0) + clampedWeight;
    }
    
    await setDocument('quote_feed_state', userId, {
        userId,
        ...state,
        topicScores: updatedScores,
        updatedAt: serverTimestamp(),
    }, idToken);
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
        userId,
        viewedQuoteIds: state.viewedQuoteIds,
        topicScores,
        hasCompletedOnboarding: true,
        updatedAt: serverTimestamp(),
    });
}

// ─── Smart Feed Algorithm ────────────────────────────────────────────

const MAX_PER_TOPIC = 12; // Diversity cap
const FEED_SIZE = 40;

/**
 * Get personalized quote feed for a user
 * Filters viewed, scores by topic preference, caps topic diversity
 * NEW: Filters strictly to explicitTopics if requested by the Swiper UI pills.
 * NEW: Boosts quotes dynamically based on micro-tag scores.
 */
export async function getPersonalizedFeed(
    userId: string, 
    savedPhrases: string[] = [], 
    explicitTopics?: string[],
    deckId?: string | null
): Promise<{
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

    // Filter out viewed quotes and prune by explicit topic filters from the Swiper UI
    const viewedSet = new Set(state.viewedQuoteIds);
    let candidates = allQuotes.filter(q => {
        if (!q.id || viewedSet.has(q.id)) return false;
        
        // If deckId is passed, ONLY return quotes generated for that deck
        if (deckId) {
            return q.tags?.includes(`deck:${deckId}`);
        }

        // If explicit UI topics are passed (e.g., user clicked "History" pill), ONLY return History.
        if (explicitTopics && explicitTopics.length > 0) {
            return explicitTopics.includes(q.topic);
        }
        return true;
    });

    // If too few unviewed, allow oldest-viewed to resurface
    if (candidates.length < FEED_SIZE) {
        const viewedQuotes = allQuotes.filter(q => {
            if (!q.id || !viewedSet.has(q.id)) return false;
            
            if (deckId) {
                return q.tags?.includes(`deck:${deckId}`);
            }

            if (explicitTopics && explicitTopics.length > 0) {
                return explicitTopics.includes(q.topic);
            }
            return true;
        });
        // Add oldest-viewed first (they're at the beginning of the FIFO array)
        candidates = [...candidates, ...viewedQuotes];
    }

    // Score each quote by topic preference, tag preference, AND saved phrases
    const scored = candidates.map(q => {
        // Base score: Broad Topic
        let score = state.topicScores[q.topic] || 0;
        
        // Granular Score Component: Micro-Tags
        if (q.tags && q.tags.length > 0) {
            for (const tag of q.tags) {
                const normalizedTag = tag.toLowerCase().trim();
                score += (state.topicScores[normalizedTag] || 0);
            }
        }
        
        let highlightedPhrases = [...(q.highlightedPhrases || [])];

        // ─── Passive Learning Boost (CAPPED) ───
        // Boost quotes containing saved phrases, but cap to prevent drowning out topic signal
        const quoteTextLower = q.text.toLowerCase();
        let phraseBoostApplied = 0;
        for (const phrase of savedPhrases) {
            if (quoteTextLower.includes(phrase)) {
                // Skip self-generated content
                if (q.sourceType === 'generated_session' && q.userId === userId) {
                    // No score boost for own content
                } else {
                    phraseBoostApplied += PHRASE_BOOST_CAP;
                }

                if (!highlightedPhrases.includes(phrase)) {
                    highlightedPhrases.push(phrase);
                }
            }
        }
        // Cap total phrase boost so it enhances but doesn't override topic preferences
        score += Math.min(phraseBoostApplied, PHRASE_BOOST_CAP * 2);

        return {
            quote: { ...q, highlightedPhrases },
            score,
        };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply topic diversity cap + exploration injection
    const topicCounts: Record<string, number> = {};
    const result: QuoteBankEntry[] = [];
    const explorationSlots = Math.floor(FEED_SIZE * EXPLORATION_RATIO);
    const mainSlots = FEED_SIZE - explorationSlots;

    // Fill main slots with top-scored quotes (topic-capped)
    for (const { quote } of scored) {
        if (result.length >= mainSlots) break;
        
        const count = topicCounts[quote.topic] || 0;
        if (count >= MAX_PER_TOPIC) continue;
        
        topicCounts[quote.topic] = count + 1;
        result.push(quote);
    }

    // Fill exploration slots with quotes from LOWEST-scored topics
    // This ensures the user discovers new interests over time
    const usedIds = new Set(result.map(q => q.id));
    const explorationCandidates = scored
        .filter(({ quote }) => quote.id && !usedIds.has(quote.id))
        .reverse(); // Lowest scores first
    
    for (const { quote } of explorationCandidates) {
        if (result.length >= FEED_SIZE) break;
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
