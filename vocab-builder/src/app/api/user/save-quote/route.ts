import { NextRequest, NextResponse } from 'next/server';
import { toggleFavoriteQuote } from '@/lib/db/favorite-quotes';

export async function POST(request: NextRequest) {
    try {
        // Simple auth check via header (matching other user routes)
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { quote } = body;

        if (!quote || !quote.id || !quote.text) {
            return NextResponse.json({ error: 'Missing quote data' }, { status: 400 });
        }

        const isSaved = await toggleFavoriteQuote(userId, quote);

        return NextResponse.json({ success: true, isSaved });
    } catch (error) {
        console.error('Error toggling favorite quote:', error);
        return NextResponse.json({ error: 'Failed to toggle favorite quote' }, { status: 500 });
    }
}
