import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserProficiency, getLabelDisplayName as getLabel, getDefaultProficiency } from '@/lib/db/user-proficiency';

/**
 * GET: Return user's proficiency level for display
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const userIdHeader = request.headers.get('x-user-id');

        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = await verifyIdToken(token);
                if (decoded) {
                    userId = decoded.uid;
                }
            } catch {
                console.log('[Get Proficiency] Token verification failed');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const proficiency = await getUserProficiency(userId);

        if (!proficiency) {
            // Return default for users who haven't taken test
            const defaults = getDefaultProficiency();
            return NextResponse.json({
                label: getLabel(defaults.proficiencyLabel),
                level: defaults.lexileLevel,
                hasTakenTest: false
            });
        }

        return NextResponse.json({
            label: getLabel(proficiency.proficiencyLabel),
            level: proficiency.lexileLevel,
            hasTakenTest: proficiency.testCount > 0
        });

    } catch (error) {
        console.error('[Get Proficiency] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get proficiency' },
            { status: 500 }
        );
    }
}
