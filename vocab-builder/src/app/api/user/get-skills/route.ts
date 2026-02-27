import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSkillProgress, getSkillSummary } from '@/lib/db/skill-progress';

/**
 * Get user's skill progress for dashboard display
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
                console.log('[Get Skills] Token verification failed');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const progress = await getSkillProgress(userId);

        if (!progress) {
            // Return default values for new user
            return NextResponse.json({
                skills: {
                    comprehension: { level: 10, trend: 'stable', weeklyChange: 0 },
                    production: { level: 10, trend: 'stable', weeklyChange: 0 },
                    interaction: { level: 10, trend: 'stable', weeklyChange: 0 },
                    retention: { level: 10, trend: 'stable', weeklyChange: 0 },
                },
                summary: {
                    overall: 10,
                    strongest: 'comprehension',
                    weakest: 'production',
                    recommendation: 'Complete some sessions to start tracking your progress!',
                },
                recentHistory: [],
            });
        }

        const summary = getSkillSummary(progress);
        const recentHistory = progress.history.slice(-20).reverse();

        return NextResponse.json({
            skills: {
                comprehension: {
                    level: progress.skills.comprehension.level,
                    trend: progress.skills.comprehension.trend,
                    weeklyChange: progress.skills.comprehension.weeklyChange,
                },
                production: {
                    level: progress.skills.production.level,
                    trend: progress.skills.production.trend,
                    weeklyChange: progress.skills.production.weeklyChange,
                },
                interaction: {
                    level: progress.skills.interaction.level,
                    trend: progress.skills.interaction.trend,
                    weeklyChange: progress.skills.interaction.weeklyChange,
                },
                retention: {
                    level: progress.skills.retention.level,
                    trend: progress.skills.retention.trend,
                    weeklyChange: progress.skills.retention.weeklyChange,
                },
            },
            summary,
            recentHistory,
        });
    } catch (error) {
        console.error('[Get Skills] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get skill progress' },
            { status: 500 }
        );
    }
}
