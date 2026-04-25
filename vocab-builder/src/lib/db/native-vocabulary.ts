import 'server-only';

import crypto from 'crypto';
import { Query } from 'node-appwrite';
import {
    getDocument,
    queryCollection,
    runQuery,
    serverTimestamp,
    setDocument,
    updateDocument,
} from '@/lib/appwrite/database';
import {
    coerceLearningGoal,
    normalizeNativeWordKey,
    parsePayload,
    parseStringList,
    selectNativeWordsForFeed,
    type LearningGoal,
    type NativeFeedState,
    type NativeWordPoolEntry,
} from '@/lib/native-vocabulary/policy';

const NATIVE_WORD_POOL_COLLECTION = 'nativeWordPool';
const USER_NATIVE_WORDS_COLLECTION = 'userNativeWords';
const NATIVE_FEED_STATE_COLLECTION = 'nativeFeedState';
const DEFAULT_POOL_QUERY_LIMIT = 200;
const VIEWED_CAP = 500;

function toNativeWordPoolEntry(doc: Record<string, unknown> & { id: string }): NativeWordPoolEntry {
    return {
        id: doc.id,
        wordKey: (doc.wordKey as string) || normalizeNativeWordKey(doc.word as string),
        word: (doc.word as string) || '',
        definition: (doc.definition as string) || '',
        vibe: (doc.vibe as string) || '',
        register: (doc.register as string) || 'elevated',
        difficulty: (doc.difficulty as string) || 'uncommon',
        tags: parseStringList(doc.tags),
        example: (doc.example as string) || '',
        followupText: (doc.followupText as string) || '',
        qualityScore: typeof doc.qualityScore === 'number' ? doc.qualityScore : Number(doc.qualityScore || 0),
        status: (doc.status as NativeWordPoolEntry['status']) || 'active',
        createdAt: doc.createdAt as string | undefined,
        updatedAt: doc.updatedAt as string | undefined,
        payload: parsePayload(doc.payload),
    };
}

function userNativeWordDocId(userId: string, wordKey: string): string {
    const hash = crypto.createHash('sha1').update(`${userId}:${wordKey}`).digest('hex').slice(0, 32);
    return `nw${hash}`;
}

export async function getNativeWordsForFeed(
    userId: string,
    goal: LearningGoal,
    limit = 24
): Promise<NativeWordPoolEntry[]> {
    let docs: Array<Record<string, unknown> & { id: string }> = [];

    try {
        docs = await queryCollection(NATIVE_WORD_POOL_COLLECTION, [
            Query.equal('status', 'active'),
            Query.orderDesc('qualityScore'),
            Query.limit(DEFAULT_POOL_QUERY_LIMIT),
        ]);
    } catch (error) {
        console.warn('[NativeVocab] Could not fetch nativeWordPool. Feed will continue without native word cards.', error);
        return [];
    }

    const nativeState = await getNativeFeedState(userId);

    return selectNativeWordsForFeed(
        docs.map(toNativeWordPoolEntry),
        nativeState,
        coerceLearningGoal(goal),
        limit
    );
}

export async function getNativeFeedState(userId: string): Promise<NativeFeedState> {
    try {
        const doc = await getDocument(NATIVE_FEED_STATE_COLLECTION, userId);
        if (!doc) {
            return {
                viewedNativeWordKeys: [],
                servedNativeFollowupKeys: [],
            };
        }
        return {
            viewedNativeWordKeys: parseStringList(doc.viewedNativeWordKeys),
            servedNativeFollowupKeys: parseStringList(doc.servedNativeFollowupKeys),
        };
    } catch (error) {
        console.warn('[NativeVocab] Could not fetch nativeFeedState. Using empty state.', error);
        return {
            viewedNativeWordKeys: [],
            servedNativeFollowupKeys: [],
        };
    }
}

export async function markNativeFeedViewed(
    userId: string,
    nativeWordKeys: string[],
    nativeFollowupKeys: string[]
): Promise<void> {
    if (nativeWordKeys.length === 0 && nativeFollowupKeys.length === 0) return;

    const state = await getNativeFeedState(userId);
    const wordSet = new Set(state.viewedNativeWordKeys);
    const followupSet = new Set(state.servedNativeFollowupKeys);

    const viewedNativeWordKeys = [
        ...state.viewedNativeWordKeys,
        ...nativeWordKeys.filter((wordKey) => wordKey && !wordSet.has(wordKey)),
    ].slice(-VIEWED_CAP);

    const servedNativeFollowupKeys = [
        ...state.servedNativeFollowupKeys,
        ...nativeFollowupKeys.filter((wordKey) => wordKey && !followupSet.has(wordKey)),
    ].slice(-VIEWED_CAP);

    await setDocument(NATIVE_FEED_STATE_COLLECTION, userId, {
        userId,
        viewedNativeWordKeys,
        servedNativeFollowupKeys,
        updatedAt: serverTimestamp(),
    });
}

export async function getUserSavedNativeWordKeys(userId: string): Promise<string[]> {
    try {
        const docs = await runQuery(
            USER_NATIVE_WORDS_COLLECTION,
            [
                { field: 'userId', op: 'EQUAL', value: userId },
                { field: 'status', op: 'EQUAL', value: 'saved' },
            ],
            500
        );
        return docs
            .map((doc) => doc.wordKey as string)
            .filter((wordKey): wordKey is string => typeof wordKey === 'string' && wordKey.length > 0);
    } catch (error) {
        console.warn('[NativeVocab] Could not fetch saved native words', error);
        return [];
    }
}

export async function toggleUserNativeWord(
    userId: string,
    word: Pick<NativeWordPoolEntry, 'wordKey' | 'word' | 'definition'> & Partial<NativeWordPoolEntry>,
    sourceCardId?: string
): Promise<{ isSaved: boolean }> {
    const wordKey = word.wordKey || normalizeNativeWordKey(word.word);
    if (!wordKey || !word.word || !word.definition) {
        throw new Error('Missing native word data');
    }

    const docId = userNativeWordDocId(userId, wordKey);
    const existing = await getDocument(USER_NATIVE_WORDS_COLLECTION, docId);
    const now = serverTimestamp();

    if (existing?.status === 'saved') {
        await updateDocument(USER_NATIVE_WORDS_COLLECTION, docId, {
            status: 'archived',
            updatedAt: now,
        });
        return { isSaved: false };
    }

    await setDocument(USER_NATIVE_WORDS_COLLECTION, docId, {
        userId,
        wordKey,
        word: word.word,
        definition: word.definition,
        savedAt: existing?.savedAt || now,
        updatedAt: now,
        sourceCardId: sourceCardId || '',
        status: 'saved',
        payload: JSON.stringify({
            vibe: word.vibe,
            register: word.register,
            difficulty: word.difficulty,
            tags: word.tags || [],
            example: word.example,
            followupText: word.followupText,
        }),
    });

    return { isSaved: true };
}
