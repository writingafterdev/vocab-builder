import { NextResponse } from 'next/server';
import { deleteDocument, getDocument, updateDocument } from '@/lib/appwrite/database';

export async function DELETE(req: Request) {
    try {
        const { phraseId, childPhrase, deleteType } = await req.json();

        if (!phraseId) {
            return NextResponse.json(
                { error: 'phraseId is required' },
                { status: 400 }
            );
        }

        if (deleteType === 'child' && childPhrase) {
            // Remove just the child expression
            const phrase = await getDocument('savedPhrases', phraseId);

            if (!phrase) {
                return NextResponse.json(
                    { error: 'Phrase not found' },
                    { status: 404 }
                );
            }

            const children = (phrase.children as Array<{ phrase: string }>) || [];
            const updatedChildren = children.filter(
                (child) => child.phrase !== childPhrase
            );

            await updateDocument('savedPhrases', phraseId, { children: updatedChildren });

            return NextResponse.json({
                success: true,
                message: 'Child expression removed'
            });
        } else {
            // Delete the entire phrase (root + all children)
            await deleteDocument('savedPhrases', phraseId);
            return NextResponse.json({
                success: true,
                message: 'Phrase deleted'
            });
        }
    } catch (error) {
        console.error('Delete phrase error:', error);
        return NextResponse.json(
            { error: 'Failed to delete phrase' },
            { status: 500 }
        );
    }
}
