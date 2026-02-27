import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, serverTimestamp } from '@/lib/firestore-rest';

const COLLECTION_NAME = 'userReadingLists';

// Add or remove a post from a reading list
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = request.headers.get('x-user-id');
        const { id: listId } = await params;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action, postId } = body;

        if (!postId) {
            return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
        }

        // Get the list first
        const list = await getDocument(COLLECTION_NAME, listId);

        if (!list) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        // Verify ownership
        if (list.userId !== userId) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        const currentPostIds = Array.isArray(list.postIds) ? list.postIds as string[] : [];

        if (action === 'add') {
            // Add post if not already in list
            if (!currentPostIds.includes(postId)) {
                await updateDocument(COLLECTION_NAME, listId, {
                    postIds: [...currentPostIds, postId],
                    updatedAt: serverTimestamp(),
                });
            }
            return NextResponse.json({
                success: true,
                message: 'Article added to list'
            });

        } else if (action === 'remove') {
            // Remove post from list
            await updateDocument(COLLECTION_NAME, listId, {
                postIds: currentPostIds.filter(id => id !== postId),
                updatedAt: serverTimestamp(),
            });
            return NextResponse.json({
                success: true,
                message: 'Article removed from list'
            });

        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('Reading list update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Delete a reading list
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const userId = request.headers.get('x-user-id');
        const { id: listId } = await params;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the list first
        const list = await getDocument(COLLECTION_NAME, listId);

        if (!list) {
            return NextResponse.json({ error: 'List not found' }, { status: 404 });
        }

        // Verify ownership
        if (list.userId !== userId) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        // Import deleteDocument
        const { deleteDocument } = await import('@/lib/firestore-rest');
        await deleteDocument(COLLECTION_NAME, listId);

        return NextResponse.json({
            success: true,
            message: 'List deleted'
        });

    } catch (error) {
        console.error('Reading list delete error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
