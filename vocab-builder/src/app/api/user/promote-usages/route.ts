import { NextRequest, NextResponse } from 'next/server';
import { serverTimestamp, updateDocument, addDocument, getDocument } from '@/lib/appwrite/database';

interface PromoteUsagesRequest {
    usagesIncluded: Array<{
        parentPhraseId: string;
        parentPhrase: string;
        usage: { phrase: string; meaning: string; type: string };
    }>;
    userId: string;
}

/**
 * @deprecated Use POST /api/user/save-phrase with parentPhraseId instead
 * 
 * This endpoint auto-promoted potentialUsages to SavedPhrases after exercise completion.
 * It has been replaced with manual saving - users click on Layer 1 phrases to save them.
 * 
 * The new flow uses save-phrase API with:
 * - parentPhraseId: ID of parent phrase for linking
 * - layer: 1+ to indicate this is a child phrase
 * 
 * Keeping this endpoint for backward compatibility but it should not be used.
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id') || '';
        const userEmail = authUser?.userEmail || request.headers.get('x-user-email') || '';

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 401 });
        }

        const body: PromoteUsagesRequest = await request.json();
        const { usagesIncluded } = body;

        if (!usagesIncluded?.length) {
            return NextResponse.json({ promoted: 0 });
        }

        const promotedIds: string[] = [];
        const parentUpdates: Map<string, { exposedPhrases: string[]; childIds: string[] }> = new Map();

        for (const item of usagesIncluded) {
            try {
                // Generate Layer 2+ potentialUsages for this new phrase (usages only, no connotations)
                let childPotentialUsages: Array<{ phrase: string; meaning: string; type: string; isSingleWord?: boolean }> = [];
                try {
                    const suggestResponse = await fetch(`${request.nextUrl.origin}/api/user/suggest-collocations`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': userId,
                            'x-user-email': userEmail,
                        },
                        body: JSON.stringify({
                            word: item.usage.phrase,
                            context: `${item.usage.phrase}: ${item.usage.meaning}`,
                            layer: 1,  // Layer 1+ → Layer 2+: generates ONLY usages (no connotations)
                        }),
                    });
                    if (suggestResponse.ok) {
                        const suggestData = await suggestResponse.json();
                        childPotentialUsages = suggestData.potentialUsages || [];
                    }
                } catch (err) {
                    console.error('Failed to generate L3 for:', item.usage.phrase, err);
                }

                // Create new SavedPhrase for the child
                const newPhraseId = await addDocument('savedPhrases', {
                    userId,
                    phrase: item.usage.phrase,
                    meaning: item.usage.meaning,
                    context: `From exercise with "${item.parentPhrase}"`,
                    parentPhraseId: item.parentPhraseId,
                    childPhraseIds: [],
                    hasAppearedInExercise: true,  // NOW true because they just appeared!
                    potentialUsages: childPotentialUsages,
                    usedForGeneration: false,
                    usageCount: 0,
                    practiceCount: 0,
                    learningStep: 0,
                    nextReviewDate: serverTimestamp(),
                    createdAt: serverTimestamp(),
                    contexts: [],
                    currentContextIndex: 0,
                });

                promotedIds.push(newPhraseId);

                // Track parent updates
                if (!parentUpdates.has(item.parentPhraseId)) {
                    parentUpdates.set(item.parentPhraseId, { exposedPhrases: [], childIds: [] });
                }
                parentUpdates.get(item.parentPhraseId)!.exposedPhrases.push(item.usage.phrase);
                parentUpdates.get(item.parentPhraseId)!.childIds.push(newPhraseId);

            } catch (err) {
                console.error('Failed to promote usage:', item.usage.phrase, err);
            }
        }

        // Update parent documents with exposed flags and child IDs
        for (const [parentId, updates] of parentUpdates) {
            try {
                const parentDoc = await getDocument('savedPhrases', parentId) as Record<string, any> | null;
                if (!parentDoc) continue;

                const potentialUsages: any[] = parentDoc.potentialUsages || [];
                const updatedPotentialUsages = potentialUsages.map((p) => ({
                    ...p,
                    exposed: updates.exposedPhrases.includes(p.phrase) ? true : p.exposed,
                }));

                const existingChildIds = Array.isArray(parentDoc.childPhraseIds)
                    ? parentDoc.childPhraseIds
                    : [];

                await updateDocument('savedPhrases', parentId, {
                    potentialUsages: updatedPotentialUsages,
                    childPhraseIds: [...existingChildIds, ...updates.childIds],
                });
            } catch (err) {
                console.error('Failed to update parent:', parentId, err);
            }
        }

        return NextResponse.json({
            promoted: promotedIds.length,
            promotedIds,
        });

    } catch (error) {
        console.error('Promote usages error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
