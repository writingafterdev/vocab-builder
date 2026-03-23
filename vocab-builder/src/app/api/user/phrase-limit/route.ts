import { NextRequest, NextResponse } from 'next/server';
import { queryCollection } from '@/lib/appwrite/database';

const DAILY_PHRASE_LIMIT = 15;

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 401 });
        }

        const allPhrases = await queryCollection('savedPhrases');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        const todayPhrases = allPhrases.filter(p => {
            if (p.userId !== userId) return false;
            const createdAt = p.createdAt;
            if (!createdAt) return false;
            const phraseDate = new Date(createdAt as string);
            return phraseDate.getTime() >= todayTimestamp;
        });

        // Count all expressions: root phrases + children
        let saved = 0;
        todayPhrases.forEach(p => {
            const children = (p as any).children || [];
            // Count root + all children
            saved += 1 + children.length;
        });

        const remaining = Math.max(0, DAILY_PHRASE_LIMIT - saved);
        const canSave = remaining > 0;

        return NextResponse.json({
            canSave,
            saved,
            remaining,
            limit: DAILY_PHRASE_LIMIT
        });

    } catch (error) {
        console.error('Error checking phrase limit:', error);
        return NextResponse.json({
            canSave: true,
            saved: 0,
            remaining: DAILY_PHRASE_LIMIT,
            limit: DAILY_PHRASE_LIMIT
        });
    }
}
