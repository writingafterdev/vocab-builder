/**
 * Client-side API response caching utility
 * Stores responses in localStorage with TTL to reduce repeated API calls
 */

const CACHE_PREFIX = 'api_cache_';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

/**
 * Get cached data if valid, otherwise return null
 */
export function getFromCache<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(CACHE_PREFIX + key);
        if (!cached) return null;

        const entry: CacheEntry<T> = JSON.parse(cached);

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Store data in cache with optional TTL
 */
export function setInCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    if (typeof window === 'undefined') return;

    try {
        const entry: CacheEntry<T> = {
            data,
            expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
        // localStorage might be full or disabled, ignore
    }
}

/**
 * Generate a cache key from phrase and optional context
 */
export function getMeaningCacheKey(phrase: string, context?: string): string {
    const normalized = phrase.toLowerCase().trim();
    // Include truncated context hash if provided
    if (context) {
        const contextHash = context.slice(0, 50).replace(/\s+/g, '_');
        return `meaning_${normalized}_${contextHash}`;
    }
    return `meaning_${normalized}`;
}

/**
 * Generate cache key for dictionary lookups
 */
export function getDictionaryCacheKey(word: string): string {
    return `dict_${word.toLowerCase().trim()}`;
}

/**
 * Clear all API cache (useful for debugging or forced refresh)
 */
export function clearApiCache(): void {
    if (typeof window === 'undefined') return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { entries: number; sizeBytes: number } {
    if (typeof window === 'undefined') return { entries: 0, sizeBytes: 0 };

    let entries = 0;
    let sizeBytes = 0;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
            entries++;
            const value = localStorage.getItem(key);
            if (value) sizeBytes += value.length * 2; // Approximate UTF-16 size
        }
    }

    return { entries, sizeBytes };
}
