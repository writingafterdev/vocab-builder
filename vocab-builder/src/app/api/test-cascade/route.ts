import { NextResponse } from 'next/server';
import { addDocument, getDocument } from '@/lib/firestore-rest';
import { updatePracticeResult } from '@/lib/db/srs';

export async function GET(request: Request) {
    console.log('🧪 Starting Internal Cascading Test...');
    const userId = 'test-cascade-user-' + Date.now();
    const mockEmail = 'test@example.com';

    try {
        // 1. Create a root phrase with 3 locked children
        const tomorow = new Date();
        tomorow.setDate(tomorow.getDate() + 1);

        const phraseData = {
            userId,
            phrase: 'cascading root phrase',
            learningStep: 0,
            nextReviewDate: tomorow.toISOString(),
            children: [
                {
                    id: 'child_1',
                    phrase: 'locked child 1',
                    nextReviewDate: null, // LOCKED
                    learningStep: 0
                },
                {
                    id: 'child_2',
                    phrase: 'locked child 2',
                    nextReviewDate: null, // LOCKED
                    learningStep: 0
                },
                {
                    id: 'child_3',
                    phrase: 'locked child 3',
                    nextReviewDate: null, // LOCKED
                    learningStep: 0
                }
            ],
            createdAt: new Date().toISOString()
        };

        const result: any = await addDocument('savedPhrases', phraseData);
        const phraseId = result.id || result;
        console.log(`✅ Created test root phrase: ${phraseId} with 3 locked children`);

        // 2. Simulate User Answering Correctly using the actual SRS logic
        // This is what the update-practice-result API calls under the hood
        console.log(`⏳ Simulating CORRECT answer for root phrase...`);

        const res = await fetch('http://localhost:3000/api/user/update-practice-result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId
            },
            body: JSON.stringify({
                phraseId,
                result: 'correct',
                isFast: false,
                practiceConfig: {
                    topic: 'Test Topic'
                }
            })
        });

        const updateData = await res.json();
        console.log(`⏳ simulated correct answer API response:`, updateData);

        // 3. Verify the updated document
        console.log(`🔍 Verifying children status in Firestore...`);
        const updatedDoc = await getDocument('savedPhrases', phraseId);

        if (!updatedDoc) {
            return NextResponse.json({ error: 'Failed to retrieve updated doc' }, { status: 500 });
        }

        const children: any[] = updatedDoc.children ? Object.values(updatedDoc.children) : [];
        let unlockedCount = 0;
        let details: any[] = [];

        children.forEach((child: any) => {
            const isUnlocked = child.nextReviewDate !== null;
            details.push({
                phrase: child.phrase,
                status: isUnlocked ? '✅ UNLOCKED' : '❌ LOCKED',
                step: child.learningStep,
                nextReview: child.nextReviewDate
            });
            if (isUnlocked) unlockedCount++;
        });

        return NextResponse.json({
            success: true,
            message: `Test Complete: ${unlockedCount}/${children.length} children unlocked.`,
            rootPhraseId: phraseId,
            details
        });

    } catch (err: any) {
        console.error('Test Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
