import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';
import { Query } from 'node-appwrite';
import { getRequestUser } from '@/lib/request-auth';

/**
 * GET user's lookup history (all previously looked-up phrases)
 * Returns phrases sorted by most recent first
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId || request.nextUrl.searchParams.get('userId');
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);

        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        const docs = await queryCollection('lookupHistory', [
            Query.equal('userId', userId),
            Query.orderDesc('lookedUpAt'),
            Query.limit(limit),
        ]);

        const phrases = docs.map(d => ({
            phrase: d.phrase as string,
            meaning: d.meaning as string || '',
            context: d.context as string || '',
            register: d.register as string || '',
            nuance: d.nuance as string || '',
            topic: d.topic as string || '',
            subtopic: d.subtopic as string || '',
            lookedUpAt: d.lookedUpAt as string || '',
        }));

        return NextResponse.json({ phrases });
    } catch (error) {
        console.error('Fetch lookup history error:', error);
        return NextResponse.json({ error: 'Failed to fetch lookup history' }, { status: 500 });
    }
}
