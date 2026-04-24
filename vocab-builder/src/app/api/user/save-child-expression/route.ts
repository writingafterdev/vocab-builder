import { NextRequest, NextResponse } from 'next/server';
import { addChildToPhrase } from '@/lib/db/srs';
import { getRequestUser } from '@/lib/request-auth';

/**
 * POST /api/user/save-child-expression
 * 
 * Save a child expression (collocation, phrasal verb, idiom) to a parent phrase.
 * This is called when users encounter and save related expressions in exercises.
 * 
 * Request body:
 * - parentPhraseId: string - The Firestore ID of the parent phrase
 * - childExpression: {
 *     phrase: string,
 *     baseForm: string,
 *     meaning: string,
 *     type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression',
 *     context: string,
 *     topic: string,
 *     subtopic?: string,
 *     register: 'casual' | 'consultative' | 'formal',
 *     nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative'
 *   }
 * 
 * Returns:
 * - childId: string - The ID of the newly created child
 */

interface SaveChildRequest {
    parentPhraseId: string;
    childExpression: {
        phrase: string;
        baseForm: string;
        meaning: string;
        type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
        context: string;
        topic: string;
        subtopic?: string;
        register: 'casual' | 'consultative' | 'formal';
        nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    };
}

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        const userEmail = authUser?.userEmail;

        if (!userId && !userEmail) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body: SaveChildRequest = await request.json();
        const { parentPhraseId, childExpression } = body;

        // Validate required fields
        if (!parentPhraseId) {
            return NextResponse.json(
                { error: 'Parent phrase ID is required' },
                { status: 400 }
            );
        }

        if (!childExpression?.phrase || !childExpression?.meaning) {
            return NextResponse.json(
                { error: 'Child phrase and meaning are required' },
                { status: 400 }
            );
        }

        // Validate type
        const validTypes = ['collocation', 'phrasal_verb', 'idiom', 'expression'];
        if (!validTypes.includes(childExpression.type)) {
            return NextResponse.json(
                { error: 'Invalid child type' },
                { status: 400 }
            );
        }

        // Add child to phrase using the SRS function
        const result = await addChildToPhrase(parentPhraseId, {
            phrase: childExpression.phrase,
            baseForm: childExpression.baseForm || childExpression.phrase.toLowerCase(),
            meaning: childExpression.meaning,
            type: childExpression.type,
            context: childExpression.context || '',
            topic: childExpression.topic || 'daily_life',
            subtopic: childExpression.subtopic,
            register: childExpression.register || 'consultative',
            nuance: childExpression.nuance || 'neutral',
        });

        return NextResponse.json({
            success: true,
            childId: result.childId,
            message: `Saved "${childExpression.phrase}" to vocabulary bank`,
        });

    } catch (error) {
        console.error('Error saving child expression:', error);

        // Handle duplicate error specifically
        if (error instanceof Error && error.message.includes('already saved')) {
            return NextResponse.json(
                { error: error.message },
                { status: 409 }  // Conflict
            );
        }

        return NextResponse.json(
            { error: 'Failed to save expression' },
            { status: 500 }
        );
    }
}
