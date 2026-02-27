/**
 * Article Read Tracking
 * Tracks when users read articles for daily goals
 */

const STORAGE_KEY = 'articles_read';

interface ReadingData {
    date: string; // YYYY-MM-DD format
    articleIds: string[];
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get reading data from localStorage
 */
function getReadingData(): ReadingData {
    if (typeof window === 'undefined') {
        return { date: getTodayString(), articleIds: [] };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return { date: getTodayString(), articleIds: [] };
        }

        const data: ReadingData = JSON.parse(stored);

        // Reset if it's a new day
        if (data.date !== getTodayString()) {
            return { date: getTodayString(), articleIds: [] };
        }

        return data;
    } catch {
        return { date: getTodayString(), articleIds: [] };
    }
}

/**
 * Save reading data to localStorage
 */
function saveReadingData(data: ReadingData): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Track that an article was read
 */
export function trackArticleRead(articleId: string): void {
    const data = getReadingData();

    // Don't duplicate if already tracked today
    if (!data.articleIds.includes(articleId)) {
        data.articleIds.push(articleId);
        saveReadingData(data);
    }
}

/**
 * Get count of articles read today
 */
export function getArticlesReadToday(): number {
    const data = getReadingData();
    return data.articleIds.length;
}

/**
 * Check if a specific article was read today
 */
export function wasArticleReadToday(articleId: string): boolean {
    const data = getReadingData();
    return data.articleIds.includes(articleId);
}
