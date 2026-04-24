import { NextRequest, NextResponse } from 'next/server';
import { addDocument, updateDocument } from '@/lib/appwrite/database';
import { ChildExpression } from '@/lib/db/types';
import { isProductionEnv } from '@/lib/env/server';
import { getRequestUser } from '@/lib/request-auth';

export async function POST(request: NextRequest) {
    try {
        if (isProductionEnv()) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Force a "Yesterday" date to ensure items are due
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Use Date objects, firestore-rest converts them to timestampValue
        const dueTimestamp = yesterday;
        const nowTimestamp = new Date(); // firestore-rest handles Date()

        console.log(`Seeding data for User: ${userId}`);

        // 1. Root Phrase: "strategic alignment" (Business/Formal)
        // We use addDocument to let ID be auto-generated, then we can use it if needed
        const phrase1Data: Record<string, unknown> = {
            userId,
            phrase: "strategic alignment",
            meaning: "agreement between a company's strategy and its structure/culture",
            context: "We need better strategic alignment across departments.",
            register: ["formal"], // Array format
            nuance: ["neutral"],
            socialDistance: ["professional", "hierarchical_up"],
            topics: ["Business", "Management"],
            learningStep: 3, // Ready for review
            nextReviewDate: dueTimestamp, // Force due
            createdAt: nowTimestamp,
            children: [],
            contexts: [{
                id: `ctx_seed_1`,
                type: 'scenario',
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
            reviewPriority: 0,
            usedForGeneration: false,
            usageCount: 0,
            practiceCount: 0,
            // Inject history to test context rotation (previous was casual)
            lastPracticeConfig: {
                register: 'casual',
                relationship: 'friendly',
                topic: 'General'
            }
        };

        await addDocument('savedPhrases', phrase1Data);

        // 2. Root Phrase: "mitigate risk" (Business/Formal)
        const phrase2Data: Record<string, unknown> = {
            userId,
            phrase: "mitigate risk",
            meaning: "to reduce the severity or likelihood of a risk",
            context: "The new policy helps mitigate risk in volatile markets.",
            register: ["formal"],
            nuance: ["positive"],
            socialDistance: ["professional"],
            topics: ["Business", "Finance"],
            learningStep: 2, // Even = Passive (Reading)
            nextReviewDate: dueTimestamp,
            createdAt: nowTimestamp,
            children: [], // Will add child after
            contexts: [{
                id: `ctx_seed_2`,
                type: 'scenario',
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
        };

        const id2 = await addDocument('savedPhrases', phrase2Data);

        // 3. Child Expression: "risk mitigation strategy" (Child of #2)
        const childId = `child_${Date.now()}_test`;
        const childExpr: ChildExpression = {
            id: childId,
            type: 'collocation',
            phrase: "risk mitigation strategy",
            baseForm: "risk mitigation strategy",
            meaning: "a plan to reduce risk",
            context: "We developed a robust risk mitigation strategy.",
            sourceType: 'exercise',
            topic: "Business",
            register: "formal",
            nuance: "positive",
            socialDistance: ["professional"],
            learningStep: 1,
            nextReviewDate: dueTimestamp, // Child ALSO Due
            lastReviewDate: null,
            showCount: 0,
            practiceCount: 0,
            createdAt: nowTimestamp
        };

        // Update phrase 2 with child
        await updateDocument('savedPhrases', id2, {
            children: [childExpr]
        });

        // 4. Root Phrase: "leverage assets" (Business/Formal)
        const phrase3Data: Record<string, unknown> = {
            userId,
            phrase: "leverage assets",
            meaning: "use resources to maximum advantage",
            context: "We must leverage our existing assets better.",
            register: ["formal"],
            nuance: ["neutral"],
            socialDistance: ["professional"],
            topics: ["Business"],
            learningStep: 3,
            nextReviewDate: dueTimestamp,
            createdAt: nowTimestamp,
            children: [],
            contexts: [{
                id: `ctx_seed_3`,
                type: 'scenario',
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
        };
        await addDocument('savedPhrases', phrase3Data);

        // 5. Root Phrase: "hit the road" (Travel/Casual) - Should Cluster Separately
        const phrase4Data: Record<string, unknown> = {
            userId,
            phrase: "hit the road",
            meaning: "to start a journey",
            context: "We need to hit the road early to avoid traffic.",
            register: ["casual"],
            nuance: ["positive"],
            socialDistance: ["friendly"],
            topics: ["Travel", "Daily Life"],
            learningStep: 2, // Even = Passive (Reading)
            nextReviewDate: dueTimestamp,
            createdAt: nowTimestamp,
            children: [],
            contexts: [{
                id: `ctx_seed_4`,
                type: 'scenario',
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
        };
        await addDocument('savedPhrases', phrase4Data);

        // 6. Root Phrase: "deploy to production" (Tech/Neutral) - Should Cluster Separately
        const phrase5Data: Record<string, unknown> = {
            userId,
            phrase: "deploy to production",
            meaning: "release software to live users",
            context: "We will deploy to production on Friday.",
            register: ["consultative"],
            nuance: ["neutral"],
            socialDistance: ["professional"],
            topics: ["Technology", "Work"],
            learningStep: 3,
            nextReviewDate: dueTimestamp,
            createdAt: nowTimestamp,
            children: [],
            contexts: [{
                id: `ctx_seed_5`,
                type: 'scenario',
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
        };
        await addDocument('savedPhrases', phrase5Data);

        return NextResponse.json({
            success: true,
            message: `Seeded 3 phrases and 1 child for user ${userId}. All set to 'Due Yesterday'.`,
            scenario: "Business Strategy (Formal)"
        });

    } catch (error) {
        console.error('Seed error:', error);
        return NextResponse.json({ error: 'Failed to seed data' }, { status: 500 });
    }
}
