import { NextRequest, NextResponse } from 'next/server';
import { getUserSavedNativeWordKeys } from '@/lib/db/native-vocabulary';
import { getRequestUser } from '@/lib/request-auth';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const wordKeys = await getUserSavedNativeWordKeys(userId);
        return NextResponse.json({ wordKeys });
    } catch (error) {
        console.error('Error fetching saved native words:', error);
        return NextResponse.json({ error: 'Failed to fetch saved native words' }, { status: 500 });
    }
}
