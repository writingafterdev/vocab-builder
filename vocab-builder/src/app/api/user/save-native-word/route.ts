import { NextRequest, NextResponse } from 'next/server';
import { toggleUserNativeWord } from '@/lib/db/native-vocabulary';
import { normalizeNativeWordKey } from '@/lib/native-vocabulary/policy';
import { getRequestUser } from '@/lib/request-auth';

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { word, sourceCardId } = body as { word?: Record<string, unknown>; sourceCardId?: string };

        if (!word || typeof word.word !== 'string' || typeof word.definition !== 'string') {
            return NextResponse.json({ error: 'Missing native word data' }, { status: 400 });
        }

        const result = await toggleUserNativeWord(
            userId,
            {
                wordKey: typeof word.wordKey === 'string' ? word.wordKey : normalizeNativeWordKey(word.word),
                word: word.word,
                definition: word.definition,
                vibe: typeof word.vibe === 'string' ? word.vibe : undefined,
                register: typeof word.register === 'string' ? word.register : undefined,
                difficulty: typeof word.difficulty === 'string' ? word.difficulty : undefined,
                tags: Array.isArray(word.tags) ? word.tags.filter((tag): tag is string => typeof tag === 'string') : [],
                example: typeof word.example === 'string' ? word.example : undefined,
                followupText: typeof word.followupText === 'string' ? word.followupText : undefined,
            },
            sourceCardId
        );

        return NextResponse.json({ success: true, isSaved: result.isSaved });
    } catch (error) {
        console.error('Error saving native word:', error);
        return NextResponse.json({ error: 'Failed to save native word' }, { status: 500 });
    }
}
