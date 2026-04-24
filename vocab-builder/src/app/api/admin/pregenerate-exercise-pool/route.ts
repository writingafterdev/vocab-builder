import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { serverEnv } from '@/lib/env/server';
import { preGenerateExercisePools } from '@/lib/exercise/shared-pool';

function hasCronSecret(request: NextRequest): boolean {
    const secret = serverEnv.cronSecret;
    return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
    try {
        if (!hasCronSecret(request)) {
            await requireAdminRequest(request);
        }

        const body = await request.json().catch(() => ({}));
        const result = await preGenerateExercisePools({
            limit: typeof body.limit === 'number' ? body.limit : 50,
            includeProduction: body.includeProduction !== false,
        });

        return NextResponse.json({ success: true, result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to pre-generate exercise pool';
        const status = message === 'Unauthorized' ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
