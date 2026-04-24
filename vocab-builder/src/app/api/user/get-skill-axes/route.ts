import { NextRequest, NextResponse } from 'next/server';
import { getWeaknesses } from '@/lib/db/question-weaknesses';
import type { SkillAxis } from '@/lib/db/types';
import { getRequestUser } from '@/lib/request-auth';

/**
 * GET /api/user/get-skill-axes
 * Returns per-axis (cohesion, naturalness, task_achievement) accuracy
 * aggregated from the questionWeaknesses collection.
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getRequestUser(request, { allowHeaderFallback: true });
        const userId = authUser?.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const weaknesses = await getWeaknesses(userId);

        // Aggregate by skill axis
        const axes: Record<SkillAxis, { correct: number; wrong: number; total: number }> = {
            cohesion: { correct: 0, wrong: 0, total: 0 },
            naturalness: { correct: 0, wrong: 0, total: 0 },
            task_achievement: { correct: 0, wrong: 0, total: 0 },
        };

        for (const w of weaknesses) {
            const axis = w.skillAxis as SkillAxis;
            if (axes[axis]) {
                axes[axis].correct += w.correctCount || 0;
                axes[axis].wrong += w.wrongCount || 0;
                axes[axis].total += (w.correctCount || 0) + (w.wrongCount || 0);
            }
        }

        // Convert to percentages
        const result = Object.entries(axes).map(([axis, data]) => ({
            axis,
            correct: data.correct,
            wrong: data.wrong,
            total: data.total,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        }));

        return NextResponse.json({ axes: result });
    } catch (error) {
        console.error('[get-skill-axes] Error:', error);
        return NextResponse.json({ error: 'Failed to get skill axes' }, { status: 500 });
    }
}
