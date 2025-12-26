/**
 * Token usage tracking module for admin analytics
 * Logs AI token consumption per user and endpoint
 */
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    Timestamp,
    limit,
} from 'firebase/firestore';
import { checkDb } from './core';
import type { TokenUsage } from './types';

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
        const firestore = checkDb();
        await addDoc(collection(firestore, 'tokenUsage'), {
            ...input,
            createdAt: Timestamp.now(),
        });
    } catch (error) {
        // Don't throw - token logging should not break the main flow
        console.error('Failed to log token usage:', error);
    }
}

/**
 * Get token usage for a specific user
 */
export async function getUserTokenUsage(userId: string): Promise<TokenUsage[]> {
    const firestore = checkDb();
    const q = query(
        collection(firestore, 'tokenUsage'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TokenUsage));
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
    isDeepSeek: boolean; // Only show cost for DeepSeek endpoints
}

interface TokenUsageStats {
    totalTokens: number;
    deepseekTokens: number; // Only DeepSeek costs money, Gemini is free
    deepseekPromptTokens: number;
    deepseekCompletionTokens: number;
    totalCalls: number;
    avgTokensPerCall: number;
    avgTokensPerUser: number;
    userStats: UserUsageStats[];
    endpointStats: EndpointStats[];
}

/**
 * Get aggregated token usage stats for admin dashboard
 */
export async function getTokenUsageStats(daysBack: number = 30): Promise<TokenUsageStats> {
    const firestore = checkDb();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const q = query(
        collection(firestore, 'tokenUsage'),
        where('createdAt', '>=', Timestamp.fromDate(cutoffDate)),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(doc => doc.data() as Omit<TokenUsage, 'id'>);

    // Aggregate by user email
    const userMap = new Map<string, UserUsageStats>();
    for (const record of records) {
        // Use email as key, fallback to userId if email is missing
        const userKey = record.userEmail || record.userId || 'unknown';

        const existing = userMap.get(userKey) || {
            userId: record.userId, // Keep the first userId found for linking
            userEmail: record.userEmail || 'Unknown User',
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            callCount: 0,
            avgTokensPerCall: 0,
        };
        existing.totalTokens += record.totalTokens;
        existing.promptTokens += record.promptTokens;
        existing.completionTokens += record.completionTokens;
        existing.callCount += 1;

        // If we found a valid email for an entry that previously didn't have one, update it
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
    for (const record of records) {
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
        existing.totalTokens += record.totalTokens;
        existing.promptTokens += record.promptTokens;
        existing.completionTokens += record.completionTokens;
        existing.callCount += 1;
        // If any call uses DeepSeek, mark endpoint as DeepSeek (for cost calculation)
        if (isDeepSeek) existing.isDeepSeek = true;
        endpointMap.set(record.endpoint, existing);
    }

    const endpointStats = Array.from(endpointMap.values()).map(e => ({
        ...e,
        avgTokensPerCall: e.callCount > 0 ? Math.round(e.totalTokens / e.callCount) : 0,
    })).sort((a, b) => b.totalTokens - a.totalTokens);

    // Calculate totals
    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const deepseekRecords = records.filter(r => r.model?.toLowerCase().includes('deepseek'));
    const deepseekTokens = deepseekRecords.reduce((sum, r) => sum + r.totalTokens, 0);
    const deepseekPromptTokens = deepseekRecords.reduce((sum, r) => sum + r.promptTokens, 0);
    const deepseekCompletionTokens = deepseekRecords.reduce((sum, r) => sum + r.completionTokens, 0);
    const totalCalls = records.length;
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
 */
export async function getDetailedTokenUsage(limitCount: number = 100): Promise<DetailedTokenEntry[]> {
    const firestore = checkDb();
    const q = query(
        collection(firestore, 'tokenUsage'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            userId: data.userId || 'unknown',
            userEmail: data.userEmail || 'unknown',
            endpoint: data.endpoint || 'unknown',
            model: data.model || 'unknown',
            promptTokens: data.promptTokens || 0,
            completionTokens: data.completionTokens || 0,
            totalTokens: data.totalTokens || 0,
            createdAt: data.createdAt?.toDate() || new Date(),
        };
    });
}
