import { NextResponse } from 'next/server';
import { PLACEMENT_TASKS } from '@/lib/placement-test';

/**
 * GET: Return the 4 placement test tasks
 */
export async function GET() {
    return NextResponse.json({
        tasks: PLACEMENT_TASKS,
        totalTasks: PLACEMENT_TASKS.length,
        estimatedMinutes: Math.ceil(
            PLACEMENT_TASKS.reduce((sum, t) => sum + t.expectedDuration, 0) / 60
        ),
    });
}
