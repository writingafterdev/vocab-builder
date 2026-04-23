import { NextRequest, NextResponse } from 'next/server';
import { getDeckPhrases, addPhrasesToDeck } from '@/lib/db/decks';

export async function GET(_: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
    try {
        const { deckId } = await params;
        const phrases = await getDeckPhrases(deckId);
        return NextResponse.json({ phrases });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
    try {
        const { deckId } = await params;
        const { phrases } = await request.json();
        if (!Array.isArray(phrases)) {
            return NextResponse.json({ error: 'phrases must be an array' }, { status: 400 });
        }
        const result = await addPhrasesToDeck(deckId, phrases);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
