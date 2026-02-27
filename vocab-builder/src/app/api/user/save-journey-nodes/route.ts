import { NextRequest, NextResponse } from 'next/server';
import { setDocument, runQuery, serverTimestamp } from '@/lib/firestore-rest';

/**
 * Save new journey nodes to Firestore.
 * Nodes are stored as subcollection: users/{userId}/journeyNodes/{nodeId}
 * Deduplicates by phraseHash to avoid re-adding identical clusters.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { nodes, startOrder } = body;

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            return NextResponse.json({ error: 'No nodes provided' }, { status: 400 });
        }

        // Fetch existing nodes to get their phrase hashes for dedup
        const existing = await runQuery(`users/${userId}/journeyNodes`, [
            { field: 'userId', op: 'EQUAL', value: userId }
        ]);

        const existingHashes = new Set(
            existing.map((n: any) => n.phraseHash).filter(Boolean)
        );

        const savedNodes: string[] = [];
        let order = startOrder ?? existing.length;

        for (const node of nodes) {
            // Create a hash from sorted phrase IDs for dedup
            const phraseIds = node.phrases.map((p: any) => p.id).sort().join(',');
            const phraseHash = hashString(phraseIds);

            if (existingHashes.has(phraseHash)) {
                continue; // Skip duplicate
            }

            const nodeId = `node_${Date.now()}_${order}`;

            await setDocument(`users/${userId}/journeyNodes`, nodeId, {
                userId,
                clusterId: node.id,
                theme: node.theme,
                skill: node.skill || 'Contextual Usage',
                context: node.context || '',
                pragmatics: node.pragmatics || { register: '', relationship: '' },
                phrases: node.phrases,
                phraseHash,
                order,
                completedAt: null,
                createdAt: serverTimestamp()
            });

            savedNodes.push(nodeId);
            existingHashes.add(phraseHash);
            order++;
        }

        return NextResponse.json({
            success: true,
            savedCount: savedNodes.length,
            totalNodes: order
        });

    } catch (error) {
        console.error('Error saving journey nodes:', error);
        return NextResponse.json(
            { error: 'Failed to save journey nodes' },
            { status: 500 }
        );
    }
}

// Simple string hash for dedup
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return `h_${hash.toString(36)}`;
}
