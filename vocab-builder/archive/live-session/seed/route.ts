import { NextRequest, NextResponse } from 'next/server';
import { addDocument } from '@/lib/firestore-rest';

/**
 * Seed test phrases for Live Session testing
 * Creates 15 phrases at Step 3 (Familiar) level
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Seed Live Session] Starting seed for user:', userId);

        const testPhrases = [
            { phrase: "break the ice", meaning: "to do something to make people feel more comfortable" },
            { phrase: "hit the road", meaning: "to start a journey or leave" },
            { phrase: "call it a day", meaning: "to stop working for the day" },
            { phrase: "burn the midnight oil", meaning: "to work late into the night" },
            { phrase: "get the ball rolling", meaning: "to start something" },
            { phrase: "think on your feet", meaning: "to react quickly and cleverly" },
            { phrase: "take it easy", meaning: "to relax or calm down" },
            { phrase: "catch up with", meaning: "to meet someone after a long time" },
            { phrase: "on cloud nine", meaning: "extremely happy" },
            { phrase: "under the weather", meaning: "feeling sick or unwell" },
            { phrase: "piece of cake", meaning: "something very easy" },
            { phrase: "out of the blue", meaning: "unexpectedly, without warning" },
            { phrase: "in the same boat", meaning: "in the same situation" },
            { phrase: "wrap your head around", meaning: "to understand something complex" },
            { phrase: "go with the flow", meaning: "to accept things as they happen" },
        ];

        const createdIds: string[] = [];
        const now = new Date();

        for (const p of testPhrases) {
            const id = await addDocument(`users/${userId}/savedPhrases`, {
                phrase: p.phrase,
                meaning: p.meaning,
                context: "Test phrase for Live Session",
                userId: userId,
                usedForGeneration: false,
                learningStep: 3, // Familiar level - eligible for Live Session
                liveSessionStatus: 'pending',
                nextReviewDate: now.toISOString(),
                createdAt: now.toISOString(),
                topic: 'general',
                contexts: [{
                    topic: 'general',
                    register: 'casual',
                    situation: 'everyday conversation',
                    example: `Example using "${p.phrase}"`
                }],
                currentContextIndex: 0
            });

            createdIds.push(id);
            console.log(`[Seed Live Session] Created phrase: "${p.phrase}" with ID: ${id}`);
        }

        console.log(`[Seed Live Session] Successfully created ${createdIds.length} test phrases`);

        return NextResponse.json({
            success: true,
            message: `Created ${createdIds.length} test phrases at Step 3`,
            phraseIds: createdIds
        });

    } catch (error) {
        console.error('[Seed Live Session] Error:', error);
        return NextResponse.json(
            { error: 'Failed to seed phrases', details: String(error) },
            { status: 500 }
        );
    }
}
