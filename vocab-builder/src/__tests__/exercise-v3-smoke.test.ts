/** @jest-environment node */

import type { NextRequest } from 'next/server';

jest.mock('@/lib/request-auth', () => ({
    getRequestUser: jest.fn(),
}));

jest.mock('@/lib/exercise/shared-pool', () => ({
    getNextPracticeBatch: jest.fn(),
    getFeedCardsForUser: jest.fn(),
    submitFeedAttempt: jest.fn(),
    savePracticeAttemptLogs: jest.fn(),
}));

jest.mock('@/lib/appwrite/database', () => ({
    getDocument: jest.fn(),
    queryCollection: jest.fn(),
    updateDocument: jest.fn(),
    setDocument: jest.fn(),
    serverTimestamp: jest.fn(() => 'server-now'),
}));

jest.mock('@/lib/db/question-weaknesses', () => ({
    recordResult: jest.fn(),
    getWeaknesses: jest.fn(),
}));

jest.mock('@/lib/db/skill-progress', () => ({
    updateSkillProgress: jest.fn(),
}));

jest.mock('@/lib/db/srs', () => ({
    unlockChildren: jest.fn(),
}));

import { GET as getFeedQuizzes } from '@/app/api/exercise/feed-quizzes/route';
import { POST as submitExercise } from '@/app/api/exercise/submit/route';
import { GET as getDailyDrillWeaknesses } from '@/app/api/daily-drill/weaknesses/route';
import { GET as getImmersiveEligibility } from '@/app/api/immersive-session/eligible/route';
import { POST as getNextBatch } from '@/app/api/practice/next-batch/route';
import { GET as getPracticeSession } from '@/app/api/practice/get-session/route';
import { GET as listPracticeSessions } from '@/app/api/practice/list-sessions/route';
import { POST as completePracticeSession } from '@/app/api/practice/complete-session/route';
import { POST as generateFeedCardsAlias } from '@/app/api/practice/generate-feed-cards/route';
import { GET as legacyGetSessions } from '@/app/api/user/get-sessions/route';
import { POST as legacySaveSession } from '@/app/api/user/save-session/route';
import { POST as legacyUpdatePracticeResult } from '@/app/api/user/update-practice-result/route';
import { getRequestUser } from '@/lib/request-auth';
import {
    getFeedCardsForUser,
    getNextPracticeBatch,
    savePracticeAttemptLogs,
    submitFeedAttempt,
} from '@/lib/exercise/shared-pool';
import {
    getDocument,
    queryCollection,
    updateDocument,
} from '@/lib/appwrite/database';
import { getWeaknesses, recordResult } from '@/lib/db/question-weaknesses';
import { updateSkillProgress } from '@/lib/db/skill-progress';
import type { FeedCard } from '@/lib/db/types';

const mockedGetRequestUser = jest.mocked(getRequestUser);
const mockedGetFeedCardsForUser = jest.mocked(getFeedCardsForUser);
const mockedGetNextPracticeBatch = jest.mocked(getNextPracticeBatch);
const mockedSubmitFeedAttempt = jest.mocked(submitFeedAttempt);
const mockedSavePracticeAttemptLogs = jest.mocked(savePracticeAttemptLogs);
const mockedGetDocument = jest.mocked(getDocument);
const mockedQueryCollection = jest.mocked(queryCollection);
const mockedUpdateDocument = jest.mocked(updateDocument);
const mockedGetWeaknesses = jest.mocked(getWeaknesses);
const mockedRecordResult = jest.mocked(recordResult);
const mockedUpdateSkillProgress = jest.mocked(updateSkillProgress);

function makeGetRequest(url: string): NextRequest {
    return {
        nextUrl: new URL(url),
        url,
        headers: new Headers(),
    } as unknown as NextRequest;
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        nextUrl: new URL(url),
        url,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
}

describe('Exercise V3 smoke flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedGetRequestUser.mockResolvedValue({ userId: 'user_1', userEmail: 'test@example.com' });
    });

    it('creates the next practice batch from the shared pool', async () => {
        mockedGetNextPracticeBatch.mockResolvedValue({
            sessionId: 'batch_1',
            questions: [
                {
                    id: 'q_1',
                    type: 'fill_blank',
                    prompt: 'Fill it.',
                    explanation: 'Because it fits.',
                    skillAxis: 'naturalness',
                },
            ],
        });

        const response = await getNextBatch(makeJsonRequest('http://localhost/api/practice/next-batch', {}));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(mockedGetNextPracticeBatch).toHaveBeenCalledWith('user_1');
        expect(json).toEqual({ sessionId: 'batch_1', questionCount: 1 });
    });

    it('returns a question-centric V3 session and rejects legacy sessions', async () => {
        mockedGetDocument
            .mockResolvedValueOnce({
                id: 'batch_1',
                userId: 'user_1',
                content: JSON.stringify({ mode: 'practice_batch_v3', summary: 'Shared pool batch' }),
                questions: JSON.stringify([
                    {
                        id: 'q_1',
                        type: 'fill_blank',
                        prompt: 'Use the right phrase.',
                        explanation: 'It fits the context.',
                        skillAxis: 'naturalness',
                        context: 'A short context.',
                        learningBand: 'recognition',
                    },
                ]),
                phrases: JSON.stringify(['phrase_1']),
                status: 'generated',
            })
            .mockResolvedValueOnce({
                id: 'legacy_1',
                userId: 'user_1',
                content: JSON.stringify({ text: 'Old passage session' }),
                questions: JSON.stringify([]),
            });

        const v3Response = await getPracticeSession(makeGetRequest('http://localhost/api/practice/get-session?sessionId=batch_1'));
        const v3Json = await v3Response.json();

        expect(v3Response.status).toBe(200);
        expect(v3Json.session.batchMeta.mode).toBe('practice_batch_v3');
        expect(v3Json.session.questions[0].context).toBe('A short context.');

        const legacyResponse = await getPracticeSession(makeGetRequest('http://localhost/api/practice/get-session?sessionId=legacy_1'));
        const legacyJson = await legacyResponse.json();

        expect(legacyResponse.status).toBe(410);
        expect(legacyJson.error).toContain('Legacy passage-based sessions');
    });

    it('lists only V3 practice sessions', async () => {
        mockedQueryCollection.mockResolvedValue([
            {
                id: 'batch_1',
                title: 'Fresh batch',
                content: JSON.stringify({ mode: 'practice_batch_v3', summary: 'Shared pool batch' }),
                questions: JSON.stringify([{ id: 'q_1' }, { id: 'q_2' }]),
                totalPhrases: 2,
                status: 'generated',
                createdAt: '2026-04-24T00:00:00.000Z',
            },
            {
                id: 'legacy_1',
                title: 'Old session',
                content: JSON.stringify({ text: 'Old anchor passage' }),
                questions: JSON.stringify([{ id: 'q_legacy' }]),
                totalPhrases: 1,
                status: 'generated',
                createdAt: '2026-04-23T00:00:00.000Z',
            },
        ]);

        const response = await listPracticeSessions(makeGetRequest('http://localhost/api/practice/list-sessions'));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.sessions).toHaveLength(1);
        expect(json.sessions[0].id).toBe('batch_1');
    });

    it('serves feed quizzes from the shared pool and supports the legacy alias', async () => {
        const cards: FeedCard[] = [
            {
                id: 'card_1',
                userId: 'user_1',
                cardType: 'ab_natural',
                skillAxis: 'naturalness',
                sourceContent: 'A simple context.',
                sourcePlatform: 'reddit',
                sourceLabel: '📰 Feed',
                prompt: 'Which version sounds more natural?',
                options: ['A', 'B'],
                correctIndex: 0,
                explanation: 'A is more natural.',
                estimatedSeconds: 20,
                createdAt: '2026-04-24T00:00:00.000Z',
            },
        ];
        mockedGetFeedCardsForUser.mockResolvedValue(cards);

        const feedResponse = await getFeedQuizzes(makeGetRequest('http://localhost/api/exercise/feed-quizzes?refill=1'));
        const feedJson = await feedResponse.json();
        expect(feedResponse.status).toBe(200);
        expect(mockedGetFeedCardsForUser).toHaveBeenCalledWith('user_1', true);
        expect(feedJson.quizzes).toEqual(cards);

        mockedGetFeedCardsForUser.mockClear();
        mockedGetFeedCardsForUser.mockResolvedValue(cards);

        const aliasResponse = await generateFeedCardsAlias(makeJsonRequest('http://localhost/api/practice/generate-feed-cards', { forceRefill: true }));
        const aliasJson = await aliasResponse.json();
        expect(aliasResponse.status).toBe(200);
        expect(mockedGetFeedCardsForUser).toHaveBeenCalledWith('user_1', true);
        expect(aliasJson.source).toBe('shared_pool_v3');
        expect(aliasJson.cards).toEqual(cards);
    });

    it('records feed attempts through the V3 submit route', async () => {
        const response = await submitExercise(makeJsonRequest('http://localhost/api/exercise/submit', {
            questionId: 'q_1',
            questionType: 'fill_blank',
            learningBand: 'recognition',
            testedPhraseIds: ['phrase_1'],
            correct: true,
            userAnswer: 'used phrase',
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(mockedSubmitFeedAttempt).toHaveBeenCalledWith({
            userId: 'user_1',
            questionId: 'q_1',
            questionType: 'fill_blank',
            learningBand: 'recognition',
            testedPhraseIds: ['phrase_1'],
            correct: true,
            userAnswer: 'used phrase',
        });
        expect(json).toEqual({ success: true });
    });

    it('completes a V3 practice batch and writes attempt logs + weakness stats', async () => {
        mockedGetDocument.mockResolvedValue({
            id: 'batch_1',
            userId: 'user_1',
            questions: JSON.stringify([
                {
                    id: 'q_1',
                    learningBand: 'recognition',
                    testedPhraseIds: ['phrase_1'],
                },
            ]),
        });

        const response = await completePracticeSession(makeJsonRequest('http://localhost/api/practice/complete-session', {
            sessionId: 'batch_1',
            phraseIds: [],
            results: [
                {
                    questionId: 'q_1',
                    type: 'fill_blank',
                    skillAxis: 'naturalness',
                    correct: true,
                    userAnswer: 'answer',
                    timeTaken: 12,
                },
            ],
            correctCount: 1,
            totalQuestions: 1,
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(mockedUpdateDocument).toHaveBeenCalledWith('generatedSessions', 'batch_1', expect.objectContaining({
            status: 'completed_100pct',
        }));
        expect(mockedSavePracticeAttemptLogs).toHaveBeenCalledWith(
            'user_1',
            'practice',
            [
                expect.objectContaining({
                    questionId: 'q_1',
                    learningBand: 'recognition',
                    testedPhraseIds: ['phrase_1'],
                }),
            ]
        );
        expect(mockedRecordResult).toHaveBeenCalledWith(
            'user_1',
            'fill_blank',
            true,
            expect.objectContaining({ sessionId: 'batch_1', userAnswer: 'answer' })
        );
        expect(mockedUpdateSkillProgress).toHaveBeenCalledWith(
            'user_1',
            'exercise',
            1,
            'Session: 1/1 correct'
        );
        expect(json.success).toBe(true);
    });

    it('exposes dashboard drill and immersive capability state from real data sources', async () => {
        mockedGetWeaknesses.mockResolvedValue([
            { questionType: 'fill_blank', skillAxis: 'naturalness', weight: 0.8, wrongCount: 4, correctCount: 1 },
            { questionType: 'best_response', skillAxis: 'task_achievement', weight: 0.2, wrongCount: 2, correctCount: 3 },
        ] as never);
        mockedQueryCollection.mockResolvedValue(new Array(10).fill({ id: 'phrase' }));

        const weaknessesResponse = await getDailyDrillWeaknesses(makeGetRequest('http://localhost/api/daily-drill/weaknesses'));
        const weaknessesJson = await weaknessesResponse.json();
        expect(weaknessesResponse.status).toBe(200);
        expect(weaknessesJson.hasDrills).toBe(true);
        expect(weaknessesJson.weaknesses[0].questionType).toBe('fill_blank');

        const immersiveResponse = await getImmersiveEligibility(makeGetRequest('http://localhost/api/immersive-session/eligible'));
        const immersiveJson = await immersiveResponse.json();
        expect(immersiveResponse.status).toBe(200);
        expect(immersiveJson.eligible).toBe(true);
        expect(immersiveJson.currentPhrases).toBe(10);
    });

    it('keeps legacy exercise endpoints explicitly retired', async () => {
        const saveResponse = await legacySaveSession();
        const saveJson = await saveResponse.json();
        expect(saveResponse.status).toBe(410);
        expect(saveJson.replacement).toBe('/api/practice/complete-session');

        const getResponse = await legacyGetSessions();
        const getJson = await getResponse.json();
        expect(getResponse.status).toBe(410);
        expect(getJson.replacement).toBe('/api/practice/list-sessions');

        const updateResponse = await legacyUpdatePracticeResult();
        const updateJson = await updateResponse.json();
        expect(updateResponse.status).toBe(410);
        expect(updateJson.replacements).toEqual(['/api/exercise/submit', '/api/practice/complete-session']);
    });
});
