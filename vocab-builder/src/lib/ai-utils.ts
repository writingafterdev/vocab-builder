/**
 * Safe AI Response Utilities
 * 
 * Shared helpers for JSON parsing safety and localStorage operations.
 * For calling the Grok API, use `callGrok` from `./grok-client`.
 */

// ─── JSON Parsing Helpers ──────────────────────────────────────────────

/**
 * Safely parse AI-generated JSON, handling common issues:
 * - Markdown code fences (```json ... ```)
 * - Leading/trailing whitespace
 * - Trailing commas (common AI mistake)
 */
export function safeParseAIJson<T = unknown>(text: string): { success: true; data: T } | { success: false; error: string } {
    // Step 1: Strip markdown code fences
    let cleaned = text
        .replace(/^```(?:json)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '')
        .trim();

    // Step 2: Try direct parse
    try {
        return { success: true, data: JSON.parse(cleaned) as T };
    } catch {
        // Continue to fallback strategies
    }

    // Step 3: Try fixing trailing commas (common AI mistake)
    try {
        const fixedCommas = cleaned
            .replace(/,\s*([}\]])/g, '$1');
        return { success: true, data: JSON.parse(fixedCommas) as T };
    } catch {
        // Continue
    }

    // Step 4: Try extracting JSON from mixed content
    try {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return { success: true, data: JSON.parse(jsonMatch[0]) as T };
        }
    } catch {
        // Give up
    }

    return {
        success: false,
        error: `Failed to parse AI JSON. First 200 chars: ${cleaned.substring(0, 200)}`,
    };
}

// ─── localStorage Helpers ──────────────────────────────────────────────

/**
 * Safely read from localStorage with JSON parsing.
 * Returns fallback on any error (SSR, corrupted data, missing key).
 */
export function safeLocalStorageGet<T>(key: string, fallback: T): T {
    try {
        if (typeof window === 'undefined') return fallback;
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/**
 * Safely write to localStorage with JSON serialization.
 * Silently fails on SSR or quota exceeded.
 */
export function safeLocalStorageSet(key: string, value: unknown): void {
    try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Silently fail (quota exceeded, private browsing, etc.)
    }
}
