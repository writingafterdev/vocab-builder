import { NextRequest, NextResponse } from 'next/server';
import { addDocument, queryCollection, serverTimestamp } from '@/lib/firestore-rest';

/**
 * Save a new phrase to user's vocab bank
 * Used when user discovers phrases during debate translation assistance
 */

interface SavePhraseRequest {
    phrase: string;
    meaning: string;
    context?: string;
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        const userId = request.headers.get('x-user-id');

        if (!userEmail && !userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: SavePhraseRequest = await request.json();
        const { phrase, meaning, context } = body;

        if (!phrase || !meaning) {
            return NextResponse.json({ error: 'Missing phrase or meaning' }, { status: 400 });
        }

        // Use userId directly if provided, else look up by email
        let resolvedUserId = userId;
        if (!resolvedUserId && userEmail) {
            try {
                // Query users collection for email using REST API
                const users = await queryCollection('users');
                const matchingUser = users.find(u => u.email === userEmail);

                if (!matchingUser) {
                    console.log('User not found for email:', userEmail);
                    return NextResponse.json({ error: `User not found for email: ${userEmail}` }, { status: 404 });
                }

                resolvedUserId = matchingUser.id as string;
            } catch (lookupError) {
                console.error('User lookup error:', lookupError);
                return NextResponse.json({ error: `User lookup failed: ${lookupError}` }, { status: 500 });
            }
        }

        if (!resolvedUserId) {
            console.log('Could not resolve user - userId:', userId, 'email:', userEmail);
            return NextResponse.json({ error: 'Could not resolve user' }, { status: 404 });
        }

        console.log('Saving phrase for user:', resolvedUserId, 'phrase:', phrase);

        // First review in 1 day (not immediately)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const phraseData = {
            userId: resolvedUserId,
            phrase: phrase.trim(),
            meaning: meaning.trim(),
            context: context || '',
            usage: 'neutral',
            sourcePostId: null,
            usedForGeneration: false,
            usageCount: 0,
            practiceCount: 0,
            createdAt: serverTimestamp(),
            learningStep: 0,
            nextReviewDate: tomorrow.toISOString(),
            lastReviewDate: null,
            contexts: [{
                id: `ctx_${Date.now()}`,
                type: 'debate',
                sourcePostId: null,
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
        };

        const phraseId = await addDocument('savedPhrases', phraseData);

        return NextResponse.json({
            success: true,
            phraseId: phraseId,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Save phrase error:', errorMessage, error);
        return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
    }
}
