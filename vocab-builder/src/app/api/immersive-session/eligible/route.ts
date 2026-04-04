import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Check if user has enough phrases for immersive mode (threshold: 10+ phrases)
        // For now, return not eligible
        return NextResponse.json({
            eligible: false,
            reason: 'Save at least 10 phrases to unlock Immersive Mode.',
            requiredPhrases: 10,
            currentPhrases: 0,
        });
    } catch (error) {
        console.error('Immersive session eligibility error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
