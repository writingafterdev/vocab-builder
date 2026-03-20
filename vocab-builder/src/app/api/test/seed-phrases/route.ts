import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/firebase-admin';
import { addDocument, setDocument, serverTimestamp } from '@/lib/firestore-rest';
import { Timestamp } from 'firebase/firestore';

/**
 * POST /api/test/seed-phrases
 * Create sample phrases AND weaknesses for testing ALL exercise features
 * 
 * This seeds:
 * - 10 sample phrases (for Reading/Listening sessions)
 * - 4 sample weaknesses (for Daily Drill)
 */

const SAMPLE_PHRASES = [
    {
        phrase: "break the ice",
        baseForm: "break the ice",
        meaning: "To initiate conversation in a social situation",
        example: "He told a joke to break the ice at the meeting.",
        register: "casual",
        nuance: "positive",
        topic: "social",
        subtopic: "conversation"
    },
    {
        phrase: "hit the nail on the head",
        baseForm: "hit the nail on the head",
        meaning: "To describe exactly what is causing a situation or problem",
        example: "You hit the nail on the head when you said the project needed more time.",
        register: "casual",
        nuance: "positive",
        topic: "communication",
        subtopic: "accuracy"
    },
    {
        phrase: "a piece of cake",
        baseForm: "a piece of cake",
        meaning: "Something very easy to do",
        example: "The exam was a piece of cake for her.",
        register: "casual",
        nuance: "positive",
        topic: "difficulty",
        subtopic: "easy"
    },
    {
        phrase: "in the long run",
        baseForm: "in the long run",
        meaning: "Over a long period of time; eventually",
        example: "Investing now will save you money in the long run.",
        register: "consultative",
        nuance: "neutral",
        topic: "time",
        subtopic: "future"
    },
    {
        phrase: "take into account",
        baseForm: "take into account",
        meaning: "To consider something when making a decision",
        example: "Please take into account the budget constraints.",
        register: "formal",
        nuance: "neutral",
        topic: "decision-making",
        subtopic: "consideration"
    },
    {
        phrase: "get the hang of",
        baseForm: "get the hang of",
        meaning: "To learn how to do something, especially after practice",
        example: "Once you get the hang of it, driving becomes second nature.",
        register: "casual",
        nuance: "positive",
        topic: "learning",
        subtopic: "skills"
    },
    {
        phrase: "on the same page",
        baseForm: "on the same page",
        meaning: "To have a shared understanding or agreement",
        example: "Let's make sure we're all on the same page before we proceed.",
        register: "consultative",
        nuance: "positive",
        topic: "teamwork",
        subtopic: "agreement"
    },
    {
        phrase: "the bottom line",
        baseForm: "the bottom line",
        meaning: "The most important fact or consideration",
        example: "The bottom line is that we need to increase sales.",
        register: "consultative",
        nuance: "neutral",
        topic: "business",
        subtopic: "priority"
    },
    {
        phrase: "call it a day",
        baseForm: "call it a day",
        meaning: "To stop working for the day",
        example: "We've done enough; let's call it a day.",
        register: "casual",
        nuance: "neutral",
        topic: "work",
        subtopic: "ending"
    },
    {
        phrase: "keep in mind",
        baseForm: "keep in mind",
        meaning: "To remember or consider something",
        example: "Keep in mind that the deadline is next Friday.",
        register: "consultative",
        nuance: "neutral",
        topic: "memory",
        subtopic: "reminder"
    }
];

const SAMPLE_WEAKNESSES = [
    {
        id: 'grammar_subject_verb_agreement_1',
        category: 'grammar',
        specific: 'subject_verb_agreement',
        severity: 2,
        examples: ['He don\'t like coffee'],
        correction: 'He doesn\'t like coffee',
        explanation: 'Third person singular requires "doesn\'t" instead of "don\'t"',
        occurrences: 3,
        improvementScore: 20
    },
    {
        id: 'register_formality_mismatch_1',
        category: 'register',
        specific: 'formality_mismatch',
        severity: 2,
        examples: ['Hey boss, gimme the report'],
        correction: 'Excuse me, could you please provide me with the report?',
        explanation: 'Use formal language in professional settings',
        occurrences: 2,
        improvementScore: 30
    },
    {
        id: 'collocation_wrong_verb_1',
        category: 'collocation',
        specific: 'wrong_verb',
        severity: 1,
        examples: ['I made a decision to do homework'],
        correction: 'I made a decision to complete my homework',
        explanation: '"Do homework" is correct, but "complete homework" sounds more natural',
        occurrences: 1,
        improvementScore: 40
    },
    {
        id: 'pronunciation_vowel_sounds_1',
        category: 'pronunciation',
        specific: 'vowel_sounds',
        severity: 3,
        examples: ['ship vs sheep'],
        correction: 'Practice distinguishing /ɪ/ and /iː/ sounds',
        explanation: 'Short and long vowel sounds change word meaning',
        occurrences: 5,
        improvementScore: 10
    }
];

export async function POST(request: NextRequest) {
    try {
        // Try auth token first, fall back to x-user-id header for testing
        let userId: string | undefined;

        try {
            const authUser = await getAuthFromRequest(request);
            userId = authUser?.userId;
        } catch {
            // Auth failed, try header fallback
        }

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized - pass x-user-id header' }, { status: 401 });
        }

        const now = Timestamp.now();

        // 1. Seed phrases
        const createdPhrases = [];
        for (const phraseData of SAMPLE_PHRASES) {
            const phrase = {
                userId,
                phrase: phraseData.phrase,
                baseForm: phraseData.baseForm,
                meaning: phraseData.meaning,
                example: phraseData.example,
                register: phraseData.register,
                nuance: phraseData.nuance,
                topic: phraseData.topic,
                subtopic: phraseData.subtopic,
                type: 'idiom',
                masteryLevel: 0,
                learningStep: 1, // Set to 1 so Phase 4 practice article cron picks it up
                reviewCount: 0,
                correctCount: 0,
                lastReviewed: null,
                nextReviewDate: new Date().toISOString(), // Use exact variable name the cron looks for
                nextReview: null, // the old schema
                createdAt: serverTimestamp(),
                passiveExposure: {
                    readingSessionCount: 0,
                    listeningSessionCount: 0,
                    liveSessionCount: 0
                }
            };
            const docId = await addDocument('savedPhrases', phrase);
            createdPhrases.push({ id: docId, phrase: phraseData.phrase });
        }

        // 2. Seed weaknesses for Daily Drill
        const weaknesses = SAMPLE_WEAKNESSES.map(w => ({
            ...w,
            lastSeen: now,
            lastPracticed: null
        }));

        await setDocument('userWeaknesses', userId, {
            userId,
            weaknesses,
            lastUpdated: now
        });

        return NextResponse.json({
            success: true,
            message: `Seeded ${createdPhrases.length} phrases and ${weaknesses.length} weaknesses`,
            phrases: createdPhrases,
            weaknessCount: weaknesses.length,
            testingReady: {
                dailyDrill: true,
                readingSession: true,
                listeningSession: true,
                openEnded: true,
                turnBased: true
            }
        });

    } catch (error) {
        console.error('[Seed Test Data] Error:', error);
        return NextResponse.json(
            { error: 'Failed to seed test data' },
            { status: 500 }
        );
    }
}
