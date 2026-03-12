import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

function withKey(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return FIREBASE_API_KEY ? `${url}${separator}key=${FIREBASE_API_KEY}` : url;
}

/**
 * GET /api/practice/list-sessions
 * Returns the user's generated practice sessions (most recent first).
 * Always returns 200 — worst case returns an empty array.
 */
export async function GET(request: NextRequest) {
    try {
        // Auth: accept either Bearer token or x-user-id header
        let userId: string | null = null;

        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const { verifyIdToken } = await import('@/lib/firebase-admin');
                const verified = await verifyIdToken(authHeader);
                userId = verified?.uid || null;
            } catch {
                // ignore — fall through to x-user-id
            }
        }

        if (!userId) {
            userId = request.headers.get('x-user-id');
        }

        if (!userId) {
            return NextResponse.json({ sessions: [] });
        }

        // Query generatedSessions for this user via Firestore REST runQuery
        const structuredQuery = {
            from: [{ collectionId: 'generatedSessions' }],
            where: {
                fieldFilter: {
                    field: { fieldPath: 'userId' },
                    op: 'EQUAL',
                    value: { stringValue: userId },
                },
            },
            limit: 20,
        };

        const queryUrl = withKey(`${FIRESTORE_BASE_URL}:runQuery`);
        const queryRes = await fetch(queryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structuredQuery }),
        });

        if (!queryRes.ok) {
            const errText = await queryRes.text();
            console.error('[list-sessions] Firestore query failed:', queryRes.status, errText);
            // Return empty rather than 500 — the page will just show no past sessions
            return NextResponse.json({ sessions: [] });
        }

        const result = await queryRes.json();

        const docs = (Array.isArray(result) ? result : [])
            .filter((item: any) => item?.document)
            .map((item: any) => {
                const doc = item.document;
                const id = doc.name?.split('/').pop() || '';
                const fields = doc.fields || {};

                const getString = (key: string) => fields[key]?.stringValue || '';
                const getInt = (key: string) =>
                    fields[key]?.integerValue != null
                        ? parseInt(fields[key].integerValue, 10)
                        : (fields[key]?.doubleValue || 0);
                const getArr = (key: string) => fields[key]?.arrayValue?.values || [];

                return {
                    id,
                    title: getString('title') || 'Untitled Session',
                    subtitle: getString('subtitle'),
                    totalPhrases: getInt('totalPhrases'),
                    status: getString('status') || 'generated',
                    sectionCount: getArr('sections').length,
                    questionCount: getArr('questions').length,
                    createdAt: getString('createdAt') || fields['createdAt']?.timestampValue || '',
                };
            });

        // Sort newest first
        docs.sort((a: any, b: any) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });

        return NextResponse.json({ sessions: docs });

    } catch (error) {
        console.error('[list-sessions] Unexpected error:', error);
        // Always return 200 with empty sessions rather than crashing the UI
        return NextResponse.json({ sessions: [] });
    }
}
