import { addDocument, setDocument, serverTimestamp } from '../src/lib/firestore-rest';

/**
 * Script to seed phrases and weaknesses bypassing local server ports.
 * Usage: npx tsx --env-file=.env.local scripts/seed-test-phrases.ts <userId>
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
    }
];

async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error("Usage: npx tsx scripts/seed-test-phrases.ts <userId>");
        process.exit(1);
    }

    console.log(`Seeding phrases for user: ${userId}...`);

    try {
        const createdPhrases = [];
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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
                learningStep: 1, 
                reviewCount: 0,
                correctCount: 0,
                lastReviewed: null,
                nextReviewDate: yesterday.toISOString(), // Due immediately!
                nextReview: null,
                createdAt: serverTimestamp(),
                passiveExposure: { readingSessionCount: 0, listeningSessionCount: 0, liveSessionCount: 0 }
            };

            const docId = await addDocument('savedPhrases', phrase);
            createdPhrases.push(phraseData.phrase);
            console.log(`✅ Seeded: "${phraseData.phrase}"`);
        }

        await setDocument('userWeaknesses', userId, {
            userId,
            weaknesses: SAMPLE_WEAKNESSES,
            lastUpdated: serverTimestamp()
        });

        console.log(`\nSuccessfully seeded ${createdPhrases.length} phrases and weaknesses.`);

    } catch (err) {
        console.error("Error seeding phrases:", err);
    }
}

main();
