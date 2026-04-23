import { NextRequest, NextResponse } from 'next/server';
import { getDeck, updateDeck, deleteDeck } from '@/lib/db/decks';

export async function GET(_: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
    try {
        const { deckId } = await params;
        const deck = await getDeck(deckId);
        if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ deck });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
    try {
        const { deckId } = await params;
        const body = await request.json();
        await updateDeck(deckId, body);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
    try {
        const { deckId } = await params;
        await deleteDeck(deckId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
