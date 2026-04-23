import { NextRequest, NextResponse } from 'next/server';
import { listDecks, createDeck } from '@/lib/db/decks';

export async function GET() {
    try {
        const decks = await listDecks();
        return NextResponse.json({ decks });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const id = await createDeck(body);
        return NextResponse.json({ id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
