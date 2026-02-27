/**
 * Simple localStorage-based daily phrase counter
 * Tracks phrases saved today without needing Firestore queries
 */

const STORAGE_KEY = 'daily_phrase_count';

interface DailyCount {
    date: string; // YYYY-MM-DD format
    count: number;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayKey(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

/**
 * Get stored count data
 */
function getStoredData(): DailyCount | null {
    if (typeof window === 'undefined') return null;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

/**
 * Get count of phrases saved today
 */
export function getTodaySavedCount(): number {
    const stored = getStoredData();
    if (!stored) return 0;

    // Check if it's still today
    if (stored.date !== getTodayKey()) {
        // New day, reset count
        return 0;
    }

    return stored.count;
}

/**
 * Increment the daily count (call when saving a phrase)
 * @param amount - Number of phrases saved (default 1, but can include children)
 */
export function incrementDailyCount(amount: number = 1): number {
    if (typeof window === 'undefined') return 0;

    const todayKey = getTodayKey();
    const stored = getStoredData();

    let newCount: number;

    if (stored && stored.date === todayKey) {
        // Same day, increment
        newCount = stored.count + amount;
    } else {
        // New day, start fresh
        newCount = amount;
    }

    // Save back
    const data: DailyCount = {
        date: todayKey,
        count: newCount,
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Silently fail (quota exceeded, private browsing, etc.)
    }

    // Dispatch custom event so widgets can listen
    window.dispatchEvent(new CustomEvent('dailyCountUpdated', { detail: { count: newCount } }));

    return newCount;
}

/**
 * Reset daily count (for testing/debugging)
 */
export function resetDailyCount(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('dailyCountUpdated', { detail: { count: 0 } }));
}
