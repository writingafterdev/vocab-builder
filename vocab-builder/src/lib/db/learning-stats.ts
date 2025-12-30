import { queryCollection } from '@/lib/firestore-rest';

export interface DailyActivity {
    date: string; // YYYY-MM-DD
    count: number;
}

export interface LearningStatsData {
    debatesCompleted: number;
    currentStreak: number;
    bestStreak: number;
    weeklyReviews: number;
    activityData: number[]; // Last 84 days
    totalHistory: number[];    // Real history of total phrases (last 14 days)
    masteredHistory: number[]; // Real history of mastered phrases (last 14 days)
    totalPhrases: number;      // Current total count (children)
    masteredPhrases: number;   // Current mastered count (learningStep >= 6)
    recentDebates: Array<{
        id: string;
        topic: string;
        phrasesUsed: number;
        totalPhrases: number;
        date: Date;
    }>;
}

interface ChildExpression {
    type: string;
    phrase: string;
    meaning: string;
}

interface SavedPhraseDoc {
    id: string;
    userId: string;
    phrase: string;
    createdAt: Date | string;
    learningStep?: number;
    children?: ChildExpression[];
}

interface DebateDoc {
    id: string;
    userId: string;
    status: string;
    topic: string;
    createdAt: Date | string;
    phrases: Array<{ used?: boolean }>;
}

export async function getLearningStats(userId: string): Promise<LearningStatsData> {
    try {
        // 1. Fetch SavedPhrases via REST API
        const allPhrases = await queryCollection('savedPhrases') as SavedPhraseDoc[];
        const phrases = allPhrases.filter(p => p.userId === userId);

        // 2. Fetch Debates via REST API
        const allDebates = await queryCollection('debates') as DebateDoc[];
        const debates = allDebates
            .filter(d => d.userId === userId && d.status === 'completed')
            .sort((a, b) => {
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
            });

        // 3. Process Debates for Activity & Streaks
        const debatesCompleted = debates.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activityMap = new Map<string, number>();
        const dates: Date[] = [];

        debates.forEach(debate => {
            const date = new Date(debate.createdAt);
            const dateKey = date.toISOString().split('T')[0];
            activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);

            const normalizedDate = new Date(date);
            normalizedDate.setHours(0, 0, 0, 0);
            if (!dates.some(d => d.getTime() === normalizedDate.getTime())) {
                dates.push(normalizedDate);
            }
        });

        // Calculate Streaks
        dates.sort((a, b) => a.getTime() - b.getTime());
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;

        let checkDate = new Date(today);
        while (true) {
            const dateKey = checkDate.toISOString().split('T')[0];
            if (activityMap.has(dateKey)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                if (checkDate.getTime() === today.getTime()) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                break;
            }
        }

        if (dates.length > 0) {
            tempStreak = 1;
            longestStreak = 1;
            for (let i = 1; i < dates.length; i++) {
                const prev = dates[i - 1];
                const curr = dates[i];
                const diffTime = Math.abs(curr.getTime() - prev.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) tempStreak++;
                else tempStreak = 1;
                longestStreak = Math.max(longestStreak, tempStreak);
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);

        // Generate Activity Heatmap Data
        const heatmapData: number[] = [];
        for (let i = 83; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            heatmapData.push(activityMap.get(key) || 0);
        }
        const weeklyReviews = heatmapData.slice(-7).reduce((a, b) => a + b, 0);

        // 4. Calculate Phrase Stats
        // Total = count root phrases (since children are not populated)
        const phraseItems = phrases.map(p => ({ createdAt: new Date(p.createdAt) }));
        const totalHistory = calculateHistory(phraseItems, 14);

        // Mastered = phrases with learningStep >= 6
        const masteredPhrasesList = phrases.filter(p => (p.learningStep || 0) >= 6);
        const masteredHistory = calculateHistory(
            masteredPhrasesList.map(p => ({ createdAt: new Date(p.createdAt) })),
            14
        );

        const totalPhrasesCount = phrases.length;
        const masteredCount = masteredPhrasesList.length;

        // 5. Recent Debates
        const recentDebates = debates.slice(0, 5).map(debate => {
            const usedCount = (debate.phrases || []).filter(p => p.used).length;
            return {
                id: debate.id,
                topic: debate.topic,
                phrasesUsed: usedCount,
                totalPhrases: (debate.phrases || []).length,
                date: new Date(debate.createdAt)
            };
        });

        return {
            debatesCompleted,
            currentStreak,
            bestStreak: longestStreak,
            weeklyReviews,
            activityData: heatmapData,
            totalHistory,
            masteredHistory,
            totalPhrases: totalPhrasesCount,
            masteredPhrases: masteredCount,
            recentDebates
        };

    } catch (error) {
        console.error('Error fetching learning stats:', error);
        return {
            debatesCompleted: 0,
            currentStreak: 0,
            bestStreak: 0,
            weeklyReviews: 0,
            activityData: Array(84).fill(0),
            totalHistory: Array(14).fill(0),
            masteredHistory: Array(14).fill(0),
            totalPhrases: 0,
            masteredPhrases: 0,
            recentDebates: []
        };
    }
}

// Helper to calculate cumulative history
function calculateHistory(items: { createdAt: Date }[], days: number): number[] {
    const history: number[] = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(23, 59, 59, 999);

        const count = items.filter(item => {
            const itemDate = new Date(item.createdAt);
            return itemDate <= date;
        }).length;

        history.push(count);
    }
    return history;
}
