import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, addDocument, deleteDocument } from '@/lib/firestore-rest';

interface PendingDebate {
    id: string;
    userId: string;
    topic: string;
    phrases: Array<{ phrase: string; meaning: string }>;
    status: 'pending' | 'started' | 'completed';
    createdAt: string;
    batchId: string;
}

// GET: Fetch all pending debates for user
export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 401 });
        }

        const allPending = await queryCollection('pendingDebates');
        const userPending = allPending
            .filter(p => p.userId === userId && p.status === 'pending')
            .map(p => ({
                id: p.id,
                topic: p.topic,
                phrases: p.phrases,
                batchId: p.batchId,
                createdAt: p.createdAt,
            }));

        return NextResponse.json({ pendingDebates: userPending });

    } catch (error) {
        console.error('Error fetching pending debates:', error);
        return NextResponse.json({ pendingDebates: [] });
    }
}

// POST: Create pending debates (batch)
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 401 });
        }

        const body = await request.json();
        const { clusters } = body as { clusters: Array<{ topic: string; phrases: Array<{ phrase: string; meaning: string }> }> };

        if (!clusters || !Array.isArray(clusters)) {
            return NextResponse.json({ error: 'Clusters array required' }, { status: 400 });
        }

        const batchId = `batch_${Date.now()}`;
        const createdIds: string[] = [];

        for (const cluster of clusters) {
            const docId = await addDocument('pendingDebates', {
                userId,
                topic: cluster.topic,
                phrases: cluster.phrases,
                status: 'pending',
                createdAt: new Date().toISOString(),
                batchId,
            });
            createdIds.push(docId);
        }

        return NextResponse.json({
            success: true,
            batchId,
            createdCount: createdIds.length
        });

    } catch (error) {
        console.error('Error creating pending debates:', error);
        return NextResponse.json({ error: 'Failed to create pending debates' }, { status: 500 });
    }
}

// DELETE: Remove a pending debate
export async function DELETE(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        const pendingId = request.nextUrl.searchParams.get('id');
        const clearAll = request.nextUrl.searchParams.get('clearAll') === 'true';

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 401 });
        }

        if (clearAll) {
            // Delete all pending debates for user
            const allPending = await queryCollection('pendingDebates');
            const userPending = allPending.filter(p => p.userId === userId && p.status === 'pending');

            for (const p of userPending) {
                await deleteDocument('pendingDebates', p.id as string);
            }

            return NextResponse.json({ success: true, deletedCount: userPending.length });
        }

        if (!pendingId) {
            return NextResponse.json({ error: 'Pending debate ID required' }, { status: 400 });
        }

        await deleteDocument('pendingDebates', pendingId);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error deleting pending debate:', error);
        return NextResponse.json({ error: 'Failed to delete pending debate' }, { status: 500 });
    }
}
