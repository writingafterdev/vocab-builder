/**
 * Token usage tracking module for admin analytics
 * Logs AI token consumption per user and endpoint
 * 
 * Uses Firestore REST API for Cloudflare Workers compatibility
 */
import { addDocument, queryCollection, serverTimestamp } from '../appwrite/database';

interface TokenUsageInput {
    userId: string;
    userEmail: string;
    endpoint: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

/**
 * Log token usage after an AI API call
 */
export async function logTokenUsage(input: TokenUsageInput): Promise<void> {
    try {
        await addDocument('tokenUsage', {
            ...input,
            createdAt: serverTimestamp(),
        });
    } catch (error) {
        // Don't throw - token logging should not break the main flow
        console.error('Failed to log token usage:', error);
    }
}

interface UserUsageStats {
    userId: string;
    userEmail: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    callCount: number;
    avgTokensPerCall: number;
}

interface EndpointStats {
    endpoint: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    callCount: number;
    avgTokensPerCall: number;
    isDeepSeek: boolean;
}

interface TokenUsageStats {
    totalTokens: number;
    deepseekTokens: number;
    deepseekPromptTokens: number;
    deepseekCompletionTokens: number;
    totalCalls: number;
    avgTokensPerCall: number;
    avgTokensPerUser: number;
    userStats: UserUsageStats[];
    endpointStats: EndpointStats[];
}

interface TokenRecord {
    userId: string;
    userEmail: string;
    endpoint: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: string | Date;
}

/**
 * Get aggregated token usage stats for admin dashboard
 */
export async function getTokenUsageStats(daysBack: number = 30): Promise<TokenUsageStats> {
    try {
        const records = (await queryCollection('tokenUsage', { limit: 1000 })) as unknown as TokenRecord[];

        // Filter by date client-side (REST API has limited query support)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);

        const filteredRecords = records.filter(r => {
            const createdAt = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
            return createdAt >= cutoffDate;
        });

        // Aggregate by user email
        const userMap = new Map<string, UserUsageStats>();
        for (const record of filteredRecords) {
            const userKey = record.userEmail || record.userId || 'unknown';
            const existing = userMap.get(userKey) || {
                userId: record.userId,
                userEmail: record.userEmail || 'Unknown User',
                totalTokens: 0,
                promptTokens: 0,
                completionTokens: 0,
                callCount: 0,
                avgTokensPerCall: 0,
            };
            existing.totalTokens += record.totalTokens || 0;
            existing.promptTokens += record.promptTokens || 0;
            existing.completionTokens += record.completionTokens || 0;
            existing.callCount += 1;
            if (record.userEmail && existing.userEmail === 'Unknown User') {
                existing.userEmail = record.userEmail;
            }
            userMap.set(userKey, existing);
        }

        const userStats = Array.from(userMap.values()).map(u => ({
            ...u,
            avgTokensPerCall: u.callCount > 0 ? Math.round(u.totalTokens / u.callCount) : 0,
        })).sort((a, b) => b.totalTokens - a.totalTokens);

        // Aggregate by endpoint
        const endpointMap = new Map<string, EndpointStats>();
        for (const record of filteredRecords) {
            const isDeepSeek = record.model?.toLowerCase().includes('deepseek') || false;
            const existing = endpointMap.get(record.endpoint) || {
                endpoint: record.endpoint,
                totalTokens: 0,
                promptTokens: 0,
                completionTokens: 0,
                callCount: 0,
                avgTokensPerCall: 0,
                isDeepSeek: isDeepSeek,
            };
            existing.totalTokens += record.totalTokens || 0;
            existing.promptTokens += record.promptTokens || 0;
            existing.completionTokens += record.completionTokens || 0;
            existing.callCount += 1;
            if (isDeepSeek) existing.isDeepSeek = true;
            endpointMap.set(record.endpoint, existing);
        }

        const endpointStats = Array.from(endpointMap.values()).map(e => ({
            ...e,
            avgTokensPerCall: e.callCount > 0 ? Math.round(e.totalTokens / e.callCount) : 0,
        })).sort((a, b) => b.totalTokens - a.totalTokens);

        // Calculate totals
        const totalTokens = filteredRecords.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
        const deepseekRecords = filteredRecords.filter(r => r.model?.toLowerCase().includes('deepseek'));
        const deepseekTokens = deepseekRecords.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
        const deepseekPromptTokens = deepseekRecords.reduce((sum, r) => sum + (r.promptTokens || 0), 0);
        const deepseekCompletionTokens = deepseekRecords.reduce((sum, r) => sum + (r.completionTokens || 0), 0);
        const totalCalls = filteredRecords.length;
        const uniqueUsers = userMap.size;

        return {
            totalTokens,
            deepseekTokens,
            deepseekPromptTokens,
            deepseekCompletionTokens,
            totalCalls,
            avgTokensPerCall: totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0,
            avgTokensPerUser: uniqueUsers > 0 ? Math.round(totalTokens / uniqueUsers) : 0,
            userStats,
            endpointStats,
        };
    } catch (error) {
        console.error('Failed to get token usage stats:', error);
        return {
            totalTokens: 0,
            deepseekTokens: 0,
            deepseekPromptTokens: 0,
            deepseekCompletionTokens: 0,
            totalCalls: 0,
            avgTokensPerCall: 0,
            avgTokensPerUser: 0,
            userStats: [],
            endpointStats: [],
        };
    }
}

export interface DetailedTokenEntry {
    id: string;
    userId: string;
    userEmail: string;
    endpoint: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: Date;
}

/**
 * Get detailed token usage entries for admin panel
 * @param limitCount - Maximum number of entries to return
 * @param todayOnly - If true, only return entries from today (since midnight)
 */
export async function getDetailedTokenUsage(limitCount: number = 100, todayOnly: boolean = false): Promise<DetailedTokenEntry[]> {
    try {
        const records = await queryCollection('tokenUsage', { limit: todayOnly ? 500 : limitCount });
        let entries = records.map(data => ({
            id: data.id as string,
            userId: (data.userId as string) || 'unknown',
            userEmail: (data.userEmail as string) || 'unknown',
            endpoint: (data.endpoint as string) || 'unknown',
            model: (data.model as string) || 'unknown',
            promptTokens: (data.promptTokens as number) || 0,
            completionTokens: (data.completionTokens as number) || 0,
            totalTokens: (data.totalTokens as number) || 0,
            createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt as string),
        }));

        // Filter to today only if requested
        if (todayOnly) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            entries = entries.filter(e => e.createdAt >= today);
        }

        // Sort by createdAt descending (newest first)
        entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return entries.slice(0, limitCount);
    } catch (error) {
        console.error('Failed to get detailed token usage:', error);
        return [];
    }
}
