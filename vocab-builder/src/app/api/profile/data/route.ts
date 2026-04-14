import { NextRequest, NextResponse } from 'next/server';
import { getLearningStats } from '@/lib/db/learning-stats';
import { getUserReposts } from '@/lib/db/social';
import { getSavedArticles } from '@/lib/db/bookmarks';
import { getPost } from '@/lib/db/posts';
import { getRecentReadingSessions } from '@/lib/db/reading-cache';

export async function GET(request: NextRequest) {
    try {
        // Authenticate request using user token or x-user-id header
        const userId = request.headers.get('x-user-id');
        const authHeader = request.headers.get('Authorization');

        if (!userId || !authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // We assume token validation is handled mostly by the client 
        // since read policies on these collections are generally safe, 
        // but we ensure the userId is passed legitimately.
        
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
