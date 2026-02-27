/**
 * Safe AI Response Utilities
 * 
 * Shared helpers for calling DeepSeek API with proper error handling,
 * JSON parsing safety, and field validation.
 */

const DEEPSEEK_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// ─── Types ─────────────────────────────────────────────────────────────

export interface AICallOptions {
    /** System message for the AI */
    system?: string;
    /** User/prompt message */
    prompt: string;
    /** Temperature (0-1). Lower = more deterministic. Default: 0.7 */
    temperature?: number;
    /** Max tokens to generate. Default: 4000 */
    maxTokens?: number;
    /** Force JSON output format. Default: true */
    jsonMode?: boolean;
    /** Required top-level fields in the JSON response */
    requiredFields?: string[];
}

export type AICallResult<T = unknown> =
    | { success: true; data: T; rawText: string }
    | { success: false; error: string; rawText?: string };

// ─── Core Function ─────────────────────────────────────────────────────

/**
 * Call DeepSeek API with safe JSON parsing and field validation.
 * 
 * @returns Parsed JSON data or error with details
 */
export async function callAI<T = unknown>(options: AICallOptions): Promise<AICallResult<T>> {
    const {
        system,
        prompt,
        temperature = 0.7,
        maxTokens = 4000,
        jsonMode = true,
        requiredFields,
    } = options;

    if (!DEEPSEEK_API_KEY) {
        return { success: false, error: 'API key not configured' };
    }

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    if (system) {
        messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    // Call API
    let response: Response;
    try {
        response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages,
                max_tokens: maxTokens,
                temperature,
                ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
            }),
        });
    } catch (err) {
        return { success: false, error: `Network error: ${err instanceof Error ? err.message : 'Unknown'}` };
    }

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        return { success: false, error: `API ${response.status}: ${errorBody.substring(0, 200)}` };
    }

    // Extract text
    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    try {
        data = await response.json();
    } catch {
        return { success: false, error: 'Failed to parse API response envelope' };
    }

    const rawText = data.choices?.[0]?.message?.content || '';
    if (!rawText) {
        return { success: false, error: 'AI returned empty response', rawText };
    }

    // Clean and parse JSON
    const parsed = safeParseAIJson<T>(rawText);
    if (!parsed.success) {
        return { success: false, error: parsed.error, rawText };
    }

    // Validate required fields
    if (requiredFields && requiredFields.length > 0) {
        const obj = parsed.data as Record<string, unknown>;
        const missing = requiredFields.filter(f => !(f in obj));
        if (missing.length > 0) {
            return {
                success: false,
                error: `AI response missing required fields: ${missing.join(', ')}`,
                rawText,
            };
        }
    }

    return { success: true, data: parsed.data, rawText };
}

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
