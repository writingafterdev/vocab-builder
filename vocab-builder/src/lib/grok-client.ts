/**
 * Centralized Grok (xAI) Client
 *
 * Manages 3 purpose-separated API keys:
 * - articles:  Article processing, batch, cron, quote extraction
 * - phrases:   Phrase lookup, save/enrichment, collocations
 * - exercises: Exercise generation, evaluation, quizzes
 *
 * Falls back to XAI_API_KEY if group-specific key is not set.
 */

import { safeParseAIJson } from './ai-utils';

// ─── Key Groups ────────────────────────────────────────────────────────

export type GrokKeyGroup = 'articles' | 'phrases' | 'exercises' | 'tts';

const KEY_ENV_MAP: Record<GrokKeyGroup, string> = {
    articles:  'GROK_KEY_ARTICLES',
    phrases:   'GROK_KEY_PHRASES',
    exercises: 'GROK_KEY_EXERCISES',
    tts:       'GROK_KEY_TTS',
};

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-4-1-fast-non-reasoning';

/**
 * Get the API key for a specific group.
 * Falls back to XAI_API_KEY for backwards compat / dev.
 */
export function getGrokKey(group: GrokKeyGroup): string {
    return process.env[KEY_ENV_MAP[group]]
        || process.env.XAI_API_KEY
        || '';
}

/**
 * Check if a key group has a configured API key.
 */
export function hasGrokKey(group: GrokKeyGroup): boolean {
    return !!getGrokKey(group);
}

// ─── Types ─────────────────────────────────────────────────────────────

export interface GrokCallOptions {
    /** System message for the AI */
    system?: string;
    /** User/prompt message */
    prompt: string;
    /** Temperature (0-1). Default: 0.7 */
    temperature?: number;
    /** Max tokens to generate. Default: 4000 */
    maxTokens?: number;
    /** Force JSON output format. Default: true */
    jsonMode?: boolean;
    /** Required top-level fields in the JSON response */
    requiredFields?: string[];
}

export type GrokCallResult<T = unknown> =
    | { success: true; data: T; rawText: string }
    | { success: false; error: string; rawText?: string };

// ─── Core Function ─────────────────────────────────────────────────────

/**
 * Call Grok (xAI) API with:
 * - Purpose-separated API keys
 * - Safe JSON parsing (handles markdown fences, trailing commas)
 * - Required field validation
 *
 * @param group - Which API key to use ('articles' | 'phrases' | 'exercises')
 * @param options - Prompt, system message, temperature, etc.
 */
export async function callGrok<T = unknown>(
    group: GrokKeyGroup,
    options: GrokCallOptions,
): Promise<GrokCallResult<T>> {
    const {
        system,
        prompt,
        temperature = 0.7,
        maxTokens = 4000,
        jsonMode = true,
        requiredFields,
    } = options;

    const apiKey = getGrokKey(group);
    if (!apiKey) {
        return { success: false, error: `No API key configured for group '${group}'. Set ${KEY_ENV_MAP[group]} or XAI_API_KEY.` };
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
        response = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GROK_MODEL,
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
        return { success: false, error: `Grok API ${response.status}: ${errorBody.substring(0, 200)}` };
    }

    // Extract text
    let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    try {
        data = await response.json();
    } catch {
        return { success: false, error: 'Failed to parse Grok API response envelope' };
    }

    const rawText = data.choices?.[0]?.message?.content || '';
    if (!rawText) {
        return { success: false, error: 'Grok returned empty response', rawText };
    }

    // Parse JSON (if jsonMode)
    if (!jsonMode) {
        return { success: true, data: rawText as unknown as T, rawText };
    }

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
                error: `Grok response missing fields: ${missing.join(', ')}`,
                rawText,
            };
        }
    }

    return { success: true, data: parsed.data, rawText };
}
