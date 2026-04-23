import { NextRequest, NextResponse } from 'next/server';
import { deleteDeckPhrase } from '@/lib/db/decks';

export async function DELETE(
    _: NextRequest,
    { params }: { params: Promise<{ deckId: string; phraseId: string }> }
) {
    try {
        const { deckId, phraseId } = await params;
        await deleteDeckPhrase(phraseId, deckId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
