import { NextRequest, NextResponse } from 'next/server';
import { runQuery, deleteDocument } from '@/lib/firestore-rest';

/**
 * DELETE all saved phrases for a user
 * Use with caution - this is destructive!
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[Clear Phrases] Deleting all phrases for user: ${userId}`);

        // Get all user phrases
        const phrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            500
        );

        console.log(`[Clear Phrases] Found ${phrases.length} phrases to delete`);

        // Delete each phrase
        let deletedCount = 0;
        for (const phrase of phrases) {
            try {
                await deleteDocument('savedPhrases', phrase.id);
                deletedCount++;
            } catch (e) {
                console.warn(`Failed to delete phrase ${phrase.id}:`, e);
            }
        }

        console.log(`[Clear Phrases] Deleted ${deletedCount}/${phrases.length} phrases`);

        return NextResponse.json({
            success: true,
            deletedCount,
            message: `Deleted ${deletedCount} phrases`
        });

    } catch (error) {
        console.error('Clear phrases error:', error);
        return NextResponse.json(
            { error: 'Failed to clear phrases' },
            { status: 500 }
        );
    }
}
