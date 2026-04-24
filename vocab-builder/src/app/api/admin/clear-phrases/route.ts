import { NextRequest, NextResponse } from 'next/server';
import { runQuery, deleteDocument } from '@/lib/appwrite/database';
import { getAdminRequestContext } from '@/lib/admin-auth';

/**
 * DELETE all saved phrases for a user
 * Use with caution - this is destructive!
 */
export async function DELETE(request: NextRequest) {
    try {
        const admin = await getAdminRequestContext(request);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const userId = request.nextUrl.searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
