import { NextRequest, NextResponse } from 'next/server';
import {
    addDocument,
    getDocument,
    queryCollection,
    serverTimestamp
} from '@/lib/appwrite/database';
import { getRequestUser } from '@/lib/request-auth';

const COLLECTION_NAME = 'userReadingLists';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all reading lists for this user
        const allLists = await queryCollection(COLLECTION_NAME);
        const userLists = allLists.filter((list) => list.userId === userId);

        return NextResponse.json({ lists: userLists });

    } catch (error) {
        console.error('Get reading lists error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action, collectionId, name, description, coverColor } = body;

        if (action === 'clone') {
            // Clone an existing collection
            if (!collectionId) {
                return NextResponse.json({ error: 'Collection ID required' }, { status: 400 });
            }

            // Check if already cloned
            const allLists = await queryCollection(COLLECTION_NAME);
            const alreadyCloned = allLists.some(
                (list) => list.userId === userId && list.sourceId === collectionId
            );

            if (alreadyCloned) {
                return NextResponse.json({
                    error: 'You have already cloned this collection'
                }, { status: 400 });
            }

            // Get the source collection
            const sourceCollection = await getDocument('collections', collectionId);

            if (!sourceCollection) {
                return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
            }

            // Create user's copy
            const now = serverTimestamp();
            const listId = await addDocument(COLLECTION_NAME, {
                userId,
                name: sourceCollection.name,
                description: sourceCollection.description || '',
                coverColor: sourceCollection.coverColor || 'blue',
                postIds: Array.isArray(sourceCollection.postIds) ? [...sourceCollection.postIds] : [],
                sourceId: collectionId,
                isPublic: false,
                createdAt: now,
                updatedAt: now,
            });

            return NextResponse.json({
                success: true,
                listId,
                message: 'Collection cloned to your library!'
            });

        } else if (action === 'create') {
            // Create a new reading list
            if (!name) {
                return NextResponse.json({ error: 'Name required' }, { status: 400 });
            }

            const now = serverTimestamp();
            const listId = await addDocument(COLLECTION_NAME, {
                userId,
                name,
                description: description || '',
                coverColor: coverColor || 'blue',
                postIds: [],
                isPublic: false,
                createdAt: now,
                updatedAt: now,
            });

            return NextResponse.json({
                success: true,
                listId,
                message: 'Reading list created!'
            });

        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('Reading lists action error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
