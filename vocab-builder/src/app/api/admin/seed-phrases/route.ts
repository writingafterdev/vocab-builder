import { NextRequest, NextResponse } from 'next/server';
import { addDocument, queryCollection, serverTimestamp } from '@/lib/firestore-rest';

/**
 * Seed test phrases for cron job testing.
 * POST /api/admin/seed-phrases?email=writingafterx@gmail.com
 * 
 * Seeds 12 realistic phrases with nextReviewDate = today,
 * so the daily-import cron will pick them up.
 */
export async function POST(request: NextRequest) {
    // Accept userId directly (preferred) or look up by email
    let userId = request.nextUrl.searchParams.get('userId');
    const email = request.nextUrl.searchParams.get('email') || request.headers.get('x-user-email');
    
    if (!userId && !email) {
        return NextResponse.json({ error: 'userId or email required' }, { status: 400 });
    }

    if (!userId) {
        // Look up user ID by email (note: queryCollection doesn't filter, so we filter manually)
        const allUsers = await queryCollection('users');
        const matchingUser = allUsers.find(u => u.email === email);
        if (!matchingUser) {
            return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
        }
        userId = matchingUser.id as string;
    }

    // Today and tomorrow dates for SRS — use Date objects so toFirestoreValue() stores them as timestampValue
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    // 12 realistic English phrases at various learning steps
    const seedPhrases = [
        // Step 1-2 (recognition) — due today
        { phrase: 'drive growth', meaning: 'to cause something to increase or develop', context: 'The new strategy will drive growth across all markets.', register: 'formal', topics: ['business', 'economics'], learningStep: 1, nextReviewDate: today },
        { phrase: 'on the other hand', meaning: 'used to present a contrasting viewpoint', context: 'I love the city. On the other hand, the countryside is peaceful.', register: 'consultative', topics: ['academic', 'writing'], learningStep: 1, nextReviewDate: today },
        { phrase: 'get the hang of', meaning: 'to learn how to do something properly', context: "Don't worry, you'll get the hang of it after a few tries.", register: 'casual', topics: ['learning', 'daily life'], learningStep: 2, nextReviewDate: today },
        { phrase: 'bear in mind', meaning: 'to remember and consider something', context: 'Bear in mind that the deadline is next Friday.', register: 'consultative', topics: ['workplace', 'communication'], learningStep: 1, nextReviewDate: today },
        // Step 3-4 (comprehension) — due today
        { phrase: 'come to terms with', meaning: 'to accept a difficult situation', context: 'She finally came to terms with the loss.', register: 'consultative', topics: ['emotions', 'personal growth'], learningStep: 3, nextReviewDate: today },
        { phrase: 'shed light on', meaning: 'to clarify or explain something', context: 'The report sheds light on the root cause of the issue.', register: 'formal', topics: ['research', 'analysis'], learningStep: 3, nextReviewDate: today },
        { phrase: 'break new ground', meaning: 'to do something innovative', context: 'The startup broke new ground with their AI-powered translation tool.', register: 'consultative', topics: ['technology', 'innovation'], learningStep: 4, nextReviewDate: today },
        // Step 5+ (production) — due tomorrow (for practice article batch)
        { phrase: 'a blessing in disguise', meaning: 'something bad that turns out to have a good result', context: 'Losing that job was a blessing in disguise — I found my passion.', register: 'casual', topics: ['life lessons', 'personal growth'], learningStep: 5, nextReviewDate: tomorrow },
        { phrase: 'the elephant in the room', meaning: 'an obvious problem no one wants to discuss', context: "Let's address the elephant in the room — our budget is shrinking.", register: 'consultative', topics: ['workplace', 'communication'], learningStep: 5, nextReviewDate: tomorrow },
        { phrase: 'hit the ground running', meaning: 'to start something with a lot of energy and enthusiasm', context: 'She hit the ground running on her first day at the new job.', register: 'consultative', topics: ['workplace', 'career'], learningStep: 6, nextReviewDate: tomorrow },
        { phrase: 'cut corners', meaning: 'to do something in the easiest or cheapest way', context: "We can't cut corners on safety standards.", register: 'consultative', topics: ['business', 'quality'], learningStep: 5, nextReviewDate: tomorrow },
        { phrase: 'think outside the box', meaning: 'to think creatively or unconventionally', context: 'We need to think outside the box to solve this problem.', register: 'consultative', topics: ['creativity', 'problem solving'], learningStep: 6, nextReviewDate: tomorrow },
    ];

    const created: string[] = [];

    for (const p of seedPhrases) {
        try {
            const result = await addDocument('savedPhrases', {
                userId,
                phrase: p.phrase,
                meaning: p.meaning,
                context: p.context,
                register: p.register,
                nuance: 'neutral',
                topics: p.topics,
                learningStep: p.learningStep,
                nextReviewDate: p.nextReviewDate,
                createdAt: new Date(),
                usedForGeneration: false,
                usageCount: 0,
                contexts: [],
                currentContextIndex: 0,
                rootWord: null,
                completedFormats: [],
            });
            created.push(p.phrase);
        } catch (err) {
            console.error(`Failed to seed phrase "${p.phrase}":`, err);
        }
    }

    return NextResponse.json({
        success: true,
        userId,
        email,
        seeded: created.length,
        phrases: created,
        note: `7 due today (feed quizzes), 5 due tomorrow (practice article)`,
    });
}
