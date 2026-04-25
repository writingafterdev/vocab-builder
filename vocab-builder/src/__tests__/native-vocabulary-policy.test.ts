/** @jest-environment node */

import fs from 'fs';
import path from 'path';
import {
    normalizeNativeWordKey,
    selectNativeWordsForFeed,
    validateNativeWordSeedEntry,
    type NativeWordPoolEntry,
} from '@/lib/native-vocabulary/policy';

describe('native vocabulary policy', () => {
    it('normalizes word keys into stable pool identifiers', () => {
        expect(normalizeNativeWordKey('  Halcyon Days! ')).toBe('halcyon_days');
        expect(normalizeNativeWordKey('_Evanescent')).toBe('evanescent');
    });

    it('prioritizes fresh active words by quality and resurfaces old words only as fallback', () => {
        const words: NativeWordPoolEntry[] = [
            makeWord('ephemeral', 0.9),
            makeWord('luminous', 0.95),
            makeWord('disabled', 1, 'disabled'),
            makeWord('halcyon', 0.8),
        ];

        const selected = selectNativeWordsForFeed(
            words,
            {
                viewedNativeWordKeys: ['luminous'],
                servedNativeFollowupKeys: [],
            },
            'beautiful_english',
            3
        );

        expect(selected.map((word) => word.wordKey)).toEqual(['ephemeral', 'halcyon', 'luminous']);
    });

    it('keeps natural-English users on a low-frequency native word lane', () => {
        const words = Array.from({ length: 10 }, (_, index) => makeWord(`word_${index}`, 1 - index / 100));
        const selected = selectNativeWordsForFeed(
            words,
            {
                viewedNativeWordKeys: [],
                servedNativeFollowupKeys: [],
            },
            'natural_english',
            24
        );

        expect(selected).toHaveLength(5);
    });

    it('ships valid curated seed entries', () => {
        const seedPath = path.join(process.cwd(), 'data', 'native-beautiful-words.seed.json');
        const entries = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

        expect(entries.length).toBeGreaterThanOrEqual(75);
        for (const entry of entries) {
            expect(validateNativeWordSeedEntry(entry)).toEqual([]);
        }
    });
});

function makeWord(
    word: string,
    qualityScore: number,
    status: NativeWordPoolEntry['status'] = 'active'
): NativeWordPoolEntry {
    return {
        wordKey: normalizeNativeWordKey(word),
        word,
        definition: 'A useful definition.',
        vibe: 'clear',
        register: 'elevated',
        difficulty: 'uncommon',
        tags: ['test'],
        example: 'A short example.',
        followupText: 'A short followup.',
        qualityScore,
        status,
    };
}
