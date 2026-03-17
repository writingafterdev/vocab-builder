import { getGrokKey } from './grok-client';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-4-1-fast-non-reasoning';

function getApiKey(): string {
    const key = getGrokKey('articles');
    if (!key) throw new Error('No Grok API key configured for articles. Set GROK_KEY_ARTICLES or XAI_API_KEY.');
    return key;
}

function headers(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchRequest {
    batch_request_id: string;
    model?: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' };
}

export interface BatchStatus {
    batch_id: string;
    name: string;
    status: string;
    state: {
        num_requests: number;
        num_pending: number;
        num_success: number;
        num_error: number;
    };
    created_at: string;
    completed_at?: string;
}

export interface BatchResult {
    batch_request_id: string;
    response?: {
        content: string;
        usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
        finish_reason: string;
    };
    error_message?: string;
}

export interface BatchResultsPage {
    succeeded: BatchResult[];
    failed: BatchResult[];
    pagination_token?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Create a new batch container
 */
export async function createBatch(name: string): Promise<string> {
    const res = await fetch(`${XAI_BASE_URL}/batches`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to create batch: ${res.status} ${err}`);
    }

    const data = await res.json();
    return data.batch_id;
}

/**
 * Step 2: Add requests to a batch
 * Sends up to 100 requests per call (xAI rate limit: 100 calls per 30s)
 */
export async function addBatchRequests(
    batchId: string,
    requests: BatchRequest[]
): Promise<void> {
    // xAI format: wrap each request in chat_get_completion
    const batchRequests = requests.map(req => ({
        batch_request_id: req.batch_request_id,
        batch_request: {
            chat_get_completion: {
                model: req.model || DEFAULT_MODEL,
                messages: req.messages,
                ...(req.temperature !== undefined && { temperature: req.temperature }),
                ...(req.max_tokens !== undefined && { max_tokens: req.max_tokens }),
                ...(req.response_format && { response_format: req.response_format }),
            },
        },
    }));

    // Chunk into groups of 50 to be safe with payload sizes
    const CHUNK_SIZE = 50;
    for (let i = 0; i < batchRequests.length; i += CHUNK_SIZE) {
        const chunk = batchRequests.slice(i, i + CHUNK_SIZE);

        const res = await fetch(`${XAI_BASE_URL}/batches/${batchId}/requests`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ batch_requests: chunk }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to add batch requests: ${res.status} ${err}`);
        }
    }
}

/**
 * Step 3: Check batch status
 */
export async function getBatchStatus(batchId: string): Promise<BatchStatus> {
    const res = await fetch(`${XAI_BASE_URL}/batches/${batchId}`, {
        method: 'GET',
        headers: headers(),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to get batch status: ${res.status} ${err}`);
    }

    const data = await res.json();

    return {
        batch_id: data.batch_id || data.id,
        name: data.name || '',
        status: data.status || data.state?.status || 'unknown',
        state: {
            num_requests: data.state?.num_requests || data.request_counts?.total || 0,
            num_pending: data.state?.num_pending || 0,
            num_success: data.state?.num_success || data.request_counts?.completed || 0,
            num_error: data.state?.num_error || data.request_counts?.failed || 0,
        },
        created_at: data.created_at,
        completed_at: data.completed_at,
    };
}

/**
 * Step 4: Retrieve batch results (paginated)
 */
export async function getBatchResults(
    batchId: string,
    pageSize: number = 100,
    paginationToken?: string
): Promise<BatchResultsPage> {
    const params = new URLSearchParams({ page_size: String(pageSize) });
    if (paginationToken) {
        params.set('pagination_token', paginationToken);
    }

    const res = await fetch(
        `${XAI_BASE_URL}/batches/${batchId}/results?${params}`,
        { method: 'GET', headers: headers() }
    );

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to get batch results: ${res.status} ${err}`);
    }

    const data = await res.json();

    // Normalize results
    const succeeded: BatchResult[] = (data.succeeded || data.results || [])
        .filter((r: any) => {
            const isValid = !r.error_message && !r.error && !r.batch_result?.error;
            const hasResponse = r.response || r.batch_result?.response;
            return isValid && hasResponse;
        })
        .map((r: any) => {
            const actualResponse = r.response || r.batch_result?.response?.chat_get_completion || r.batch_result?.response;
            return {
                batch_request_id: r.batch_request_id,
                response: {
                    content: actualResponse?.content
                        || actualResponse?.choices?.[0]?.message?.content
                        || actualResponse?.body?.choices?.[0]?.message?.content
                        || '',
                    usage: actualResponse?.usage
                        || actualResponse?.body?.usage
                        || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                    finish_reason: actualResponse?.finish_reason
                        || actualResponse?.choices?.[0]?.finish_reason
                        || 'unknown',
                },
            };
        });

    const failed: BatchResult[] = (data.failed || data.results || [])
        .filter((r: any) => r.error_message || r.error || r.batch_result?.error)
        .map((r: any) => ({
            batch_request_id: r.batch_request_id,
            error_message: r.error_message || r.error?.message || r.batch_result?.error?.message || 'Unknown error',
        }));

    return {
        succeeded,
        failed,
        pagination_token: data.pagination_token || undefined,
    };
}

/**
 * Get ALL results (auto-paginates)
 */
export async function getAllBatchResults(batchId: string): Promise<{
    succeeded: BatchResult[];
    failed: BatchResult[];
}> {
    const allSucceeded: BatchResult[] = [];
    const allFailed: BatchResult[] = [];
    let token: string | undefined;

    do {
        const page = await getBatchResults(batchId, 100, token);
        allSucceeded.push(...page.succeeded);
        allFailed.push(...page.failed);
        token = page.pagination_token;
    } while (token);

    return { succeeded: allSucceeded, failed: allFailed };
}

/**
 * Cancel a batch
 */
export async function cancelBatch(batchId: string): Promise<void> {
    const res = await fetch(`${XAI_BASE_URL}/batches/${batchId}/cancel`, {
        method: 'POST',
        headers: headers(),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to cancel batch: ${res.status} ${err}`);
    }
}

/**
 * Check if batch is complete (helper)
 */
export function isBatchComplete(status: BatchStatus): boolean {
    return status.state.num_pending === 0;
}

/**
 * Check if batch has any results ready
 */
export function hasBatchResults(status: BatchStatus): boolean {
    return status.state.num_success > 0 || status.state.num_error > 0;
}
