/**
 * Simple in-memory rate limiter for API routes
 * Limits requests per user/IP to prevent abuse
 * 
 * ⚠️ PRODUCTION WARNING:
 * This uses an in-memory Map which has two limitations:
 * 1. Resets on every server restart/deployment
 * 2. Not shared across multiple server instances (horizontal scaling)
 * 
 * For production at scale, replace with Redis-based rate limiting:
 * - Upstash Redis: https://upstash.com/blog/nextjs-rate-limiting
 * - @upstash/ratelimit package
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute

export interface RateLimitConfig {
    maxRequests: number;  // Max requests in window
    windowMs: number;     // Window size in milliseconds
}

// Default configs for different endpoints
export const RATE_LIMITS = {
    generation: { maxRequests: 10, windowMs: 60 * 60 * 1000 },  // 10 per hour
    meaning: { maxRequests: 100, windowMs: 60 * 60 * 1000 },    // 100 per hour
    admin: { maxRequests: 50, windowMs: 60 * 60 * 1000 },       // 50 per hour
    default: { maxRequests: 200, windowMs: 60 * 60 * 1000 },    // 200 per hour
};

/**
 * Check if a request should be rate limited
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
    identifier: string,  // userId or IP
    config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    if (!entry || entry.resetAt < now) {
        // New window
        rateLimitStore.set(identifier, {
            count: 1,
            resetAt: now + config.windowMs
        });
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: now + config.windowMs
        };
    }

    if (entry.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt
        };
    }

    entry.count++;
    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetAt: entry.resetAt
    };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string> {
    return {
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };
}
