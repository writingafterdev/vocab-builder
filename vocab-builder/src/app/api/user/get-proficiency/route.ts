import { NextRequest, NextResponse } from 'next/server';
import { getUserProficiency, getLabelDisplayName as getLabel, getDefaultProficiency } from '@/lib/db/user-proficiency';
import { getRequestUser } from '@/lib/request-auth';

/**
 * GET: Return user's proficiency level for display
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId || null;

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
