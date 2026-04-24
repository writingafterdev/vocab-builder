/** @jest-environment node */

jest.mock('@/lib/grok-client', () => ({
    callGrok: jest.fn(),
    getGrokKey: jest.fn(),
}));

jest.mock('@/lib/appwrite/database', () => ({
    getDocument: jest.fn(),
    queryCollection: jest.fn(),
    setDocument: jest.fn(),
    addDocument: jest.fn(),
    safeDocId: (value: string) => value,
    serverTimestamp: jest.fn(() => 'server-now'),
}));

jest.mock('@/lib/db/question-weaknesses', () => ({
    recordResult: jest.fn(),
}));

import { queryCollection } from '@/lib/appwrite/database';
import { getDuePhraseTargets } from '@/lib/exercise/shared-pool';

const mockedQueryCollection = jest.mocked(queryCollection);

describe('shared pool due phrase selection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not treat future Appwrite timestamp objects as already due', async () => {
        mockedQueryCollection.mockResolvedValue([
            {
                id: 'phrase_due',
                phrase: 'take the lead',
                meaning: 'guide others',
                context: 'Mina decided to take the lead.',
                learningStep: 1,
                nextReviewDate: '2026-01-01T00:00:00.000Z',
            },
            {
                id: 'phrase_future',
                phrase: 'ephemeral',
                meaning: 'short-lived',
                context: 'The moment felt ephemeral.',
                learningStep: 2,
                nextReviewDate: {
                    seconds: 1785456000, // 2026-07-30T00:00:00.000Z
                    nanoseconds: 0,
                },
            },
        ] as never);

        const targets = await getDuePhraseTargets('user_1', 10);

        expect(targets).toEqual([
            expect.objectContaining({
                phraseId: 'phrase_due',
                phrase: 'take the lead',
                learningBand: 'recognition',
            }),
        ]);
    });
});
