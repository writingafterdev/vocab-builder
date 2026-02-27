import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/firestore-rest';

/**
 * GET user's saved phrases
 * Use ?full=true to get complete phrase data for exercise generation
 * Otherwise returns minimal data for sync checking
 */
export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get('userId');
        const full = request.nextUrl.searchParams.get('full') === 'true';
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);

        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        // Fetch user's saved phrases
        const allPhrases = await queryCollection('savedPhrases');
        const userPhrases = allPhrases
            .filter(p => p.userId === userId)
            .slice(0, limit);

        if (full) {
            // Return complete phrase data for exercise generation (includes id!)
            return NextResponse.json(userPhrases.map(p => ({
                id: p.id,  // CRITICAL: Include Firestore document ID
                phrase: p.phrase,
                meaning: p.meaning,
                register: p.register || 'consultative',
                nuance: p.nuance || 'neutral',
                topic: p.topic,
                subtopic: p.subtopic,
                potentialUsages: p.potentialUsages || [],
                nextReviewDate: p.nextReviewDate,
                createdAt: p.createdAt,
            })));
        }

        // Minimal data for sync checking
        return NextResponse.json(userPhrases.map(p => ({
            phrase: p.phrase as string,
            baseForm: p.baseForm as string | undefined,
        })));
    } catch (error) {
        console.error('Fetch saved phrases error:', error);
        return NextResponse.json({ error: 'Failed to fetch phrases' }, { status: 500 });
    }
}
