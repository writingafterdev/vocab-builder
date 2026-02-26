import { NextRequest, NextResponse } from 'next/server';
import { getUserSavedQuoteIds } from '@/lib/db/favorite-quotes';

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const quoteIds = await getUserSavedQuoteIds(userId);

        return NextResponse.json({ quoteIds });
    } catch (error) {
        console.error('Error fetching favorite quote IDs:', error);
        return NextResponse.json({ error: 'Failed to fetch favorite quote IDs' }, { status: 500 });
    }
}
