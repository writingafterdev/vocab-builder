import { NextRequest, NextResponse } from 'next/server';
import { getLearningStats } from '@/lib/db/learning-stats';
import { getUserReposts } from '@/lib/db/social';
import { getSavedArticles } from '@/lib/db/bookmarks';
import { getPost } from '@/lib/db/posts';
import { getRecentReadingSessions } from '@/lib/db/reading-cache';
import { getRequestUser } from '@/lib/request-auth';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get('userId');

        if (!targetUserId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        const stats = await getLearningStats(targetUserId);

        return NextResponse.json({
            success: true,
            stats
        });

    } catch (error: any) {
        console.error('Error fetching profile data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
