import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, addDocument, serverTimestamp } from '@/lib/appwrite/database';
import { SavedPhrase } from '@/lib/db/types';
import { getRequestUser } from '@/lib/request-auth';

interface TrackEncounterRequest {
    rootPhraseId: string;      // The parent saved phrase ID
    encounteredPhrase: string; // The variant phrase encountered
    meaning?: string;          // Optional meaning for the new phrase
    context?: string;          // Optional context where encountered
    source: 'reading' | 'practice';
}

/**
 * Track when a user encounters a variant of a saved phrase
 * Creates a NEW SavedPhrase for the encountered variant and links to parent
 * Implements "Flat Storage + Hierarchical View" model
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: TrackEncounterRequest = await request.json();
        const { rootPhraseId, encounteredPhrase, meaning, context, source } = body;

        if (!rootPhraseId || !encounteredPhrase) {
            return NextResponse.json(
                { error: 'rootPhraseId and encounteredPhrase required' },
                { status: 400 }
            );
        }

        // Get the parent phrase
        const parentPhrase = await getDocument('savedPhrases', rootPhraseId) as SavedPhrase | null;

        if (!parentPhrase) {
            return NextResponse.json(
                { error: 'Parent phrase not found' },
                { status: 404 }
            );
        }

        // Check if user owns this phrase
        if (parentPhrase.userId !== userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        // Check if already saved as child
        const existingChildIds = parentPhrase.childPhraseIds || [];
        // Also check encounteredVariants for legacy data
        const existingVariants = parentPhrase.encounteredVariants || [];
        const alreadyEncountered = existingVariants.some(
            v => v.phrase.toLowerCase() === encounteredPhrase.toLowerCase()
        );

        if (alreadyEncountered) {
            return NextResponse.json({
                success: true,
                message: 'Variant already encountered',
                alreadyEncountered: true,
            });
        }

        // Create NEW SavedPhrase for the encountered variant
        const now = new Date();
        const newChildPhrase: Partial<SavedPhrase> = {
            userId,
            phrase: encounteredPhrase,
            meaning: meaning || `Related to: ${parentPhrase.phrase}`,
            context: context || `Encountered in practice with "${parentPhrase.phrase}"`,
            sourcePostId: parentPhrase.sourcePostId,
            usedForGeneration: false,
            usageCount: 0,
            practiceCount: 0,
            learningStep: 0,
            // SRS starts fresh
            nextReviewDate: serverTimestamp() as any,
            createdAt: serverTimestamp() as any,
            // Hierarchical linking
            parentPhraseId: rootPhraseId,
            childPhraseIds: [],
            // Inherit metadata from parent
            register: parentPhrase.register,
            nuance: parentPhrase.nuance,
            topic: parentPhrase.topic,
            subtopic: parentPhrase.subtopic,
            // Contexts will be initialized on first practice
            contexts: [],
            currentContextIndex: 0,
        };

        // Save the new child phrase
        const newPhraseId = await addDocument('savedPhrases', newChildPhrase);

        // Update parent's childPhraseIds
        await updateDocument('savedPhrases', rootPhraseId, {
            childPhraseIds: [...existingChildIds, newPhraseId],
            // Also keep legacy encounteredVariants for backward compat
            encounteredVariants: [...existingVariants, {
                phrase: encounteredPhrase,
                encounteredAt: serverTimestamp(),
                source,
            }],
        });

        return NextResponse.json({
            success: true,
            message: 'New phrase created from encounter',
            newPhraseId,
            parentPhraseId: rootPhraseId,
        });

    } catch (error) {
        console.error('Track encounter error:', error);
        return NextResponse.json(
            { error: 'Failed to track encounter' },
            { status: 500 }
        );
    }
}

/**
 * Get encountered variants for a phrase
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const phraseId = searchParams.get('phraseId');

        if (!phraseId) {
            return NextResponse.json(
                { error: 'phraseId required' },
                { status: 400 }
            );
        }

        const phrase = await getDocument('savedPhrases', phraseId);

        if (!phrase || phrase.userId !== userId) {
            return NextResponse.json(
                { error: 'Phrase not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            encounteredVariants: (phrase as unknown as SavedPhrase).encounteredVariants || [],
            success: true,
        });

    } catch (error) {
        console.error('Get encounters error:', error);
        return NextResponse.json(
            { error: 'Failed to get encounters' },
            { status: 500 }
        );
    }
}
