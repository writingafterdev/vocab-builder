import { NextRequest, NextResponse } from 'next/server';
import { getUserFavoriteQuotes } from '@/lib/db/favorite-quotes';

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const quotes = await getUserFavoriteQuotes(userId);

        return NextResponse.json({ quotes });
    } catch (error) {
        console.error('Error fetching favorite quotes:', error);
        return NextResponse.json({ error: 'Failed to fetch favorite quotes' }, { status: 500 });
    }
}
