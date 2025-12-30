import { NextRequest, NextResponse } from 'next/server';
import { addDocument, queryCollection, serverTimestamp } from '@/lib/firestore-rest';

/**
 * Save a new phrase to user's vocab bank
 * Used when user discovers phrases during debate translation assistance
 */

interface ChildExpression {
    type: 'collocation' | 'phrasal_verb';
    phrase: string;
    meaning: string;
    mode: 'spoken' | 'written' | 'neutral';
    topics: string[];
}

interface SavePhraseRequest {
    phrase: string;      // Now this is the rootWord
    meaning: string;
    context?: string;
    mode?: 'spoken' | 'written' | 'neutral';
    topics?: string[];
    children?: ChildExpression[];  // Hierarchical children
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        const userId = request.headers.get('x-user-id');

        if (!userEmail && !userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: SavePhraseRequest = await request.json();
        const { phrase, meaning, context, mode, topics, children } = body;

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
                    return NextResponse.json({ error: `User not found for email: ${userEmail}` }, { status: 404 });
                }

                resolvedUserId = matchingUser.id as string;
            } catch (lookupError) {
                console.error('User lookup error:', lookupError);
                return NextResponse.json({ error: `User lookup failed: ${lookupError}` }, { status: 500 });
            }
        }

        if (!resolvedUserId) {
            return NextResponse.json({ error: 'Could not resolve user' }, { status: 404 });
        }

        // Check daily phrase limit (15 per day)
        const DAILY_PHRASE_LIMIT = 15;
        const allPhrases = await queryCollection('savedPhrases');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        const todayPhrases = allPhrases.filter(p => {
            if (p.userId !== resolvedUserId) return false;
            const createdAt = p.createdAt;
            if (!createdAt) return false;
            const phraseDate = new Date(createdAt as string);
            return phraseDate.getTime() >= todayTimestamp;
        });

        // Count all expressions: root phrases + children
        let currentSaved = 0;
        todayPhrases.forEach(p => {
            const pChildren = (p as any).children || [];
            currentSaved += 1 + pChildren.length;
        });

        // Count how many expressions we're about to save (root + selected children)
        const incomingCount = 1 + (children?.length || 0);

        if (currentSaved + incomingCount > DAILY_PHRASE_LIMIT) {
            return NextResponse.json({
                error: `Daily limit reached! You've saved ${currentSaved} expressions today. Trying to save ${incomingCount} more would exceed the ${DAILY_PHRASE_LIMIT} limit.`,
                saved: currentSaved,
                limit: DAILY_PHRASE_LIMIT
            }, { status: 429 });
        }

        // First review in 1 day (not immediately)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // Midnight tomorrow

        const phraseData = {
            userId: resolvedUserId,
            phrase: phrase.trim(),
            meaning: meaning.trim(),
            context: context || '',
            mode: mode || 'neutral',
            topics: topics || [],
            usage: 'neutral',
            sourcePostId: null,
            usedForGeneration: false,
            usageCount: 0,
            practiceCount: 0,
            createdAt: serverTimestamp(),
            learningStep: 0,
            nextReviewDate: tomorrow, // Use plain Date, firestore-rest converts to timestampValue
            lastReviewDate: null,
            // Hierarchical children (collocations + phrasal verbs)
            children: children || [],
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

        // Count after save (including children)
        const newTodayCount = currentSaved + incomingCount;
        const remaining = Math.max(0, DAILY_PHRASE_LIMIT - newTodayCount);

        return NextResponse.json({
            success: true,
            phraseId: phraseId,
            todayCount: newTodayCount,
            remaining: remaining,
            limit: DAILY_PHRASE_LIMIT
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Save phrase error:', errorMessage, error);
        return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
    }
}
