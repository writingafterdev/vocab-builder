import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Implement weakness detection based on SRS performance
        // For now, return no drills available
        return NextResponse.json({
            hasDrills: false,
            weaknesses: [],
            message: 'No weaknesses detected yet. Keep practicing!',
        });
    } catch (error) {
        console.error('Daily drill weaknesses error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
