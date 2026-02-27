/**
 * API Key Rotation Utility for Gemini AI Studio
 * 
 * Rotates through multiple API keys to bypass per-project rate limits.
 * Uses round-robin with automatic retry on rate limit errors.
 * 
 * Environment variable: AISTUDIO_API_KEYS (comma-separated)
 * Falls back to: AISTUDIO_API_KEY (single key, for backward compatibility)
 */

// Parse API keys from environment
function getApiKeys(): string[] {
    // Try comma-separated keys first
    const keysEnv = process.env.AISTUDIO_API_KEYS;
    if (keysEnv) {
        const keys = keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keys.length > 0) return keys;
    }

    // Fall back to single key
    const singleKey = process.env.AISTUDIO_API_KEY;
    if (singleKey) return [singleKey];

    return [];
}

// Track current key index (in-memory, resets on cold start)
let currentKeyIndex = 0;

// Track failed keys (temporarily skip for 1 minute)
const failedKeys: Map<string, number> = new Map();
const FAILURE_COOLDOWN_MS = 60 * 1000; // 1 minute

/**
 * Get the next available API key (round-robin)
 */
export function getNextApiKey(): string | null {
    const keys = getApiKeys();
    if (keys.length === 0) return null;

    const now = Date.now();

    // Try each key until we find one that's not in cooldown
    for (let i = 0; i < keys.length; i++) {
        const index = (currentKeyIndex + i) % keys.length;
        const key = keys[index];

        const failedAt = failedKeys.get(key);
        if (!failedAt || now - failedAt > FAILURE_COOLDOWN_MS) {
            // This key is available
            currentKeyIndex = (index + 1) % keys.length; // Move to next for next call
            failedKeys.delete(key); // Clear old failure
            return key;
        }
    }

    // All keys are in cooldown - use the oldest failed one
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    return keys[currentKeyIndex];
}

/**
 * Mark a key as failed (rate limited)
 * It will be skipped for FAILURE_COOLDOWN_MS
 */
export function markKeyFailed(key: string): void {
    failedKeys.set(key, Date.now());
}

/**
 * Get total number of configured API keys
 */
export function getApiKeyCount(): number {
    return getApiKeys().length;
}

/**
 * Get the first available API key (for fallback use cases)
 * Unlike getNextApiKey, this doesn't rotate and returns the first non-cooldown key
 */
export function getFirstApiKey(): string | undefined {
    const keys = getApiKeys();
    if (keys.length === 0) return undefined;

    const now = Date.now();

    // Find first key not in cooldown
    const availableKey = keys.find(key => {
        const failedAt = failedKeys.get(key);
        return !failedAt || now - failedAt > FAILURE_COOLDOWN_MS;
    });

    return availableKey || keys[0];
}

/**
 * Make a request with automatic key rotation on rate limit
 * 
 * @param urlBuilder - Function that takes an API key and returns the full URL
 * @param options - Fetch options (method, headers, body)
 * @param maxRetries - Maximum number of keys to try (default: all keys)
 */
export async function fetchWithKeyRotation(
    urlBuilder: (apiKey: string) => string,
    options: RequestInit,
    maxRetries?: number
): Promise<Response> {
    const keys = getApiKeys();
    const retries = maxRetries ?? keys.length;

    let lastError: Error | null = null;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        const apiKey = getNextApiKey();
        if (!apiKey) {
            throw new Error('No API keys configured. Set AISTUDIO_API_KEYS or AISTUDIO_API_KEY environment variable.');
        }

        try {
            const url = urlBuilder(apiKey);
            const response = await fetch(url, options);

            // Check for rate limit errors (429 or specific Gemini errors)
            if (response.status === 429) {
                markKeyFailed(apiKey);
                lastResponse = response;
                console.warn(`API key rate limited, trying next key (attempt ${attempt + 1}/${retries})`);
                continue;
            }

            // Check for quota exceeded in response body
            if (!response.ok) {
                const text = await response.clone().text();
                if (text.includes('RESOURCE_EXHAUSTED') || text.includes('quota')) {
                    markKeyFailed(apiKey);
                    lastResponse = response;
                    console.warn(`API key quota exhausted, trying next key (attempt ${attempt + 1}/${retries})`);
                    continue;
                }
            }

            // Success or non-rate-limit error
            return response;

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`API request failed with key, trying next:`, lastError.message);
            markKeyFailed(apiKey);
        }
    }

    // All retries exhausted
    if (lastResponse) return lastResponse;
    throw lastError || new Error('All API keys exhausted');
}
