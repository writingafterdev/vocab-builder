import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, deleteDocument } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

/**
 * DELETE /api/user/delete-all-phrases
 * Deletes ALL saved phrases for the authenticated user.$id
 */
export async function DELETE(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all phrase IDs for this user
        const phrases = await queryCollection('savedPhrases', {
            where: [{ field: 'userId', op: '==', value: userId }],
            limit: 500,
        });

        if (phrases.length === 0) {
            return NextResponse.json({ success: true, deleted: 0 });
        }

        // Delete in parallel batches of 20
        const BATCH = 20;
        for (let i = 0; i < phrases.length; i += BATCH) {
            await Promise.all(
                phrases.slice(i, i + BATCH).map((p) => deleteDocument('savedPhrases', p.id as string))
            );
        }

        // Clear localStorage cache keys are client-side — caller handles that
        return NextResponse.json({ success: true, deleted: phrases.length });
    } catch (error) {
        console.error('[delete-all-phrases] Error:', error);
        return NextResponse.json({ error: 'Failed to delete phrases' }, { status: 500 });
    }
}
