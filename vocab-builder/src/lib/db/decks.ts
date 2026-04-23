/**
 * Curated Vocabulary Decks — DB module
 * 
 * Handles:
 * - Deck CRUD (create, list, update, delete)
 * - Phrase management within decks (import, update metadata, delete)
 * - User deck subscriptions (subscribe, unsubscribe, list)
 */

import {
    addDocument,
    getDocument,
    updateDocument,
    deleteDocument,
    queryCollection,
    serverTimestamp,
} from '../appwrite/database';

import type {
    Deck,
    DeckPhrase,
    DeckType,
    DeckStatus,
    PhraseMetadataStatus,
    UserDeckSubscription,
} from './types';

// ─── Deck CRUD ───────────────────────────────────────────────────────

/**
 * Create a new deck
 */
export async function createDeck(data: {
    name: string;
    type: DeckType;
    description?: string;
    icon?: string;
    color?: string;
}): Promise<string> {
    const now = serverTimestamp();
    const id = await addDocument('decks', {
        name: data.name,
        type: data.type,
        description: data.description || '',
        icon: data.icon || '📚',
        color: data.color || '#6366f1',
        phraseCount: 0,
        status: 'active' as DeckStatus,
        createdAt: now,
        updatedAt: now,
    });
    return id;
}

/**
 * Get a single deck by ID
 */
export async function getDeck(deckId: string): Promise<Deck | null> {
    const doc = await getDocument('decks', deckId);
    if (!doc) return null;
    return doc as unknown as Deck;
}

/**
 * List decks, optionally filtered by status
 */
export async function listDecks(status?: DeckStatus): Promise<Deck[]> {
    const options = status
        ? {
            where: [{ field: 'status', op: '==' as const, value: status }],
            limit: 100,
        }
        : { limit: 100 };

    const docs = await queryCollection('decks', options);
    return docs as unknown as Deck[];
}

/**
 * Update a deck
 */
export async function updateDeck(
    deckId: string,
    data: Partial<Pick<Deck, 'name' | 'type' | 'description' | 'icon' | 'color' | 'status' | 'phraseCount'>>
): Promise<void> {
    await updateDocument('decks', deckId, {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Delete a deck and ALL its phrases + subscriptions
 */
export async function deleteDeck(deckId: string): Promise<void> {
    // Delete all phrases in the deck
    const phrases = await getDeckPhrases(deckId);
    for (const p of phrases) {
        await deleteDocument('deckPhrases', p.id);
    }

    // Delete all subscriptions to this deck
    const subs = await queryCollection('userDeckSubscriptions', {
        where: [{ field: 'deckId', op: '==', value: deckId }],
        limit: 500,
    });
    for (const s of subs) {
        await deleteDocument('userDeckSubscriptions', s.id);
    }

    // Delete the deck itself
    await deleteDocument('decks', deckId);
}

// ─── Phrase Management ───────────────────────────────────────────────

/**
 * Add phrases to a deck (bulk import)
 * Each phrase starts with metadataStatus = 'pending'
 * Returns the number of phrases actually added (skips duplicates)
 */
export async function addPhrasesToDeck(
    deckId: string,
    phrases: string[]
): Promise<{ added: number; skipped: number }> {
    // Get existing phrases for dedup
    const existing = await getDeckPhrases(deckId);
    const existingSet = new Set(existing.map(p => p.phrase.toLowerCase().trim()));

    const now = serverTimestamp();
    let added = 0;
    let skipped = 0;

    for (const raw of phrases) {
        const phrase = raw.trim();
        if (!phrase) continue;

        if (existingSet.has(phrase.toLowerCase())) {
            skipped++;
            continue;
        }

        await addDocument('deckPhrases', {
            deckId,
            phrase,
            meaning: '',
            metadataStatus: 'pending' as PhraseMetadataStatus,
            createdAt: now,
        });
        existingSet.add(phrase.toLowerCase());
        added++;
    }

    // Update deck's phrase count cache
    const newCount = existing.length + added;
    await updateDeck(deckId, { phraseCount: newCount });

    return { added, skipped };
}

/**
 * Get all phrases in a deck
 */
export async function getDeckPhrases(deckId: string): Promise<DeckPhrase[]> {
    const docs = await queryCollection('deckPhrases', {
        where: [{ field: 'deckId', op: '==', value: deckId }],
        limit: 500,
    });
    return docs as unknown as DeckPhrase[];
}

/**
 * Get phrases by metadata status (for batch processing)
 */
export async function getDeckPhrasesByStatus(
    deckId: string,
    status: PhraseMetadataStatus
): Promise<DeckPhrase[]> {
    const docs = await queryCollection('deckPhrases', {
        where: [
            { field: 'deckId', op: '==', value: deckId },
            { field: 'metadataStatus', op: '==', value: status },
        ],
        limit: 500,
    });
    return docs as unknown as DeckPhrase[];
}

/**
 * Update a deck phrase (used after AI metadata generation)
 */
export async function updateDeckPhrase(
    phraseId: string,
    data: Partial<DeckPhrase>
): Promise<void> {
    // Strip id and deckId from updates (immutable)
    const { id, deckId, ...updates } = data as any;
    await updateDocument('deckPhrases', phraseId, updates);
}

/**
 * Delete a single phrase from a deck
 */
export async function deleteDeckPhrase(
    phraseId: string,
    deckId: string
): Promise<void> {
    await deleteDocument('deckPhrases', phraseId);

    // Update phrase count
    const remaining = await getDeckPhrases(deckId);
    await updateDeck(deckId, { phraseCount: remaining.length });
}

// ─── User Subscriptions ──────────────────────────────────────────────

/**
 * Subscribe a user to a deck
 */
export async function subscribeToDeck(
    userId: string,
    deckId: string
): Promise<void> {
    // Check for existing subscription (idempotent)
    const existing = await queryCollection('userDeckSubscriptions', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'deckId', op: '==', value: deckId },
        ],
        limit: 1,
    });

    if (existing.length > 0) return; // Already subscribed

    await addDocument('userDeckSubscriptions', {
        userId,
        deckId,
        subscribedAt: serverTimestamp(),
    });
}

/**
 * Unsubscribe a user from a deck
 */
export async function unsubscribeFromDeck(
    userId: string,
    deckId: string
): Promise<void> {
    const subs = await queryCollection('userDeckSubscriptions', {
        where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'deckId', op: '==', value: deckId },
        ],
        limit: 1,
    });

    for (const sub of subs) {
        await deleteDocument('userDeckSubscriptions', sub.id);
    }
}

/**
 * Get all deck subscriptions for a user
 */
export async function getUserSubscriptions(userId: string): Promise<UserDeckSubscription[]> {
    const docs = await queryCollection('userDeckSubscriptions', {
        where: [{ field: 'userId', op: '==', value: userId }],
        limit: 100,
    });
    return docs as unknown as UserDeckSubscription[];
}

/**
 * Get full deck objects for a user's subscribed decks
 */
export async function getUserSubscribedDecks(userId: string): Promise<Deck[]> {
    const subs = await getUserSubscriptions(userId);
    if (subs.length === 0) return [];

    const decks: Deck[] = [];
    for (const sub of subs) {
        const deck = await getDeck(sub.deckId);
        if (deck && deck.status === 'active') {
            decks.push(deck);
        }
    }
    return decks;
}

/**
 * Get all subscriber user IDs for a deck
 */
export async function getDeckSubscribers(deckId: string): Promise<string[]> {
    const docs = await queryCollection('userDeckSubscriptions', {
        where: [{ field: 'deckId', op: '==', value: deckId }],
        limit: 500,
    });
    return docs.map(d => d.userId as string);
}

/**
 * Get all phrases from all decks a user is subscribed to
 * Used by the nightly cron to merge into the generation prompt
 */
export async function getUserDeckPhrases(userId: string): Promise<{
    deckId: string;
    deckName: string;
    deckType: DeckType;
    phrases: string[];
}[]> {
    const decks = await getUserSubscribedDecks(userId);
    if (decks.length === 0) return [];

    const result: { deckId: string; deckName: string; deckType: DeckType; phrases: string[] }[] = [];

    for (const deck of decks) {
        if (deck.type === 'linguistic') {
            // Linguistic: fetch actual phrase list
            const deckPhrases = await getDeckPhrases(deck.id);
            result.push({
                deckId: deck.id,
                deckName: deck.name,
                deckType: deck.type,
                phrases: deckPhrases.map(p => p.phrase),
            });
        } else {
            // Thematic: no explicit phrases, just the topic name
            result.push({
                deckId: deck.id,
                deckName: deck.name,
                deckType: deck.type,
                phrases: [], // AI generates freely based on topic
            });
        }
    }

    return result;
}
