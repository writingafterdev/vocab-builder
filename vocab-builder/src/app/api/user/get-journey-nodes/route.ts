import { NextRequest, NextResponse } from 'next/server';
import { runQuery, updateDocument, serverTimestamp } from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

/**
 * GET: Return all journey nodes for a user, ordered by `order` field.
 * PATCH: Mark a node as completed by nodeId.
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const results = await runQuery(`users/${userId}/journeyNodes`, [
            { field: 'userId', op: 'EQUAL', value: userId }
        ]);

        // Sort by order field
        const sorted = results.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

        return NextResponse.json({ nodes: sorted });

    } catch (error) {
        console.error('Error loading journey nodes:', error);
        return NextResponse.json(
            { error: 'Failed to load journey nodes' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { nodeId } = body;

        if (!nodeId) {
            return NextResponse.json({ error: 'nodeId required' }, { status: 400 });
        }

        await updateDocument(`users/${userId}/journeyNodes`, nodeId, {
            completedAt: serverTimestamp()
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error updating journey node:', error);
        return NextResponse.json(
            { error: 'Failed to update journey node' },
            { status: 500 }
        );
    }
}
