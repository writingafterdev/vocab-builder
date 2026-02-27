import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/firestore-rest';

/**
 * Get completed sessions for a user on a specific date
 * Returns all sessions for review capability
 */
export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get date from query param or use today
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        const clusterId = searchParams.get('clusterId');

        // Query sessions for this user and date
        const filters: { field: string; op: 'EQUAL' | 'ARRAY_CONTAINS'; value: unknown }[] = [
            { field: 'userId', op: 'EQUAL', value: userId },
            { field: 'date', op: 'EQUAL', value: date }
        ];

        // Optionally filter by specific cluster
        if (clusterId) {
            filters.push({ field: 'clusterId', op: 'EQUAL', value: clusterId });
        }

        const results = await runQuery('completedSessions', filters);

        // Return sessions keyed by clusterId for easy lookup
        const sessions: Record<string, any> = {};
        for (const doc of results) {
            const cId = doc.clusterId as string;
            sessions[cId] = doc.session;
        }

        return NextResponse.json({ sessions });

    } catch (error) {
        console.error('Error loading sessions:', error);
        return NextResponse.json(
            { error: 'Failed to load sessions' },
            { status: 500 }
        );
    }
}
