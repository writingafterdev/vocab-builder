import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-auth';
import { getWeaknesses } from '@/lib/db/question-weaknesses';

export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const weaknesses = await getWeaknesses(userId);
        const drillCandidates = weaknesses
            .filter(item => item.weight > 0)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map(item => ({
                questionType: item.questionType,
                skillAxis: item.skillAxis,
                weight: item.weight,
                wrongCount: item.wrongCount,
                correctCount: item.correctCount,
            }));

        return NextResponse.json({
            hasDrills: drillCandidates.length > 0,
            weaknesses: drillCandidates,
            message: drillCandidates.length > 0
                ? 'Weak areas detected from recent exercise attempts.'
                : 'No clear weak question patterns detected yet.',
        });
    } catch (error) {
        console.error('Daily drill weaknesses error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
