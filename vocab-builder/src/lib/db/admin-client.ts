/**
 * Client-safe admin API wrapper
 * Used by the admin page ('use client') to avoid importing server-only modules.
 * Each function is a thin fetch wrapper around /api/admin/data.
 */

import type { LearningCycleSettings } from '@/lib/db/types';
import type { UserProfile } from '@/types';

export interface UserPost {
    id: string;
    title?: string;
    content: string;
    isArticle: boolean;
    createdAt: Date;
    commentCount: number;
    repostCount: number;
}

export interface UserTokenUsage {
    endpoint: string;
    totalTokens: number;
    callCount: number;
    avgTokensPerCall: number;
}

export interface UserScenario {
    id: string;
    scenario: string;
    userRole: string;
    createdAt: Date;
    status: string;
    phrasesTotal: number;
    phrasesUsed: number;
    phrasesNatural: number;
    turnsCount: number;
}

function adminHeaders(email: string): HeadersInit {
    return {
        'Content-Type': 'application/json',
        'x-user-email': email,
    };
}

let _adminEmail = '';
export function setAdminEmail(email: string) {
    _adminEmail = email;
}

async function adminGet(action: string, params?: Record<string, string>) {
    const url = new URL('/api/admin/data', window.location.origin);
    url.searchParams.set('action', action);
    if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), { headers: adminHeaders(_adminEmail) });
    if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
    return res.json();
}

async function adminPost(action: string, data?: Record<string, any>, customEmail?: string) {
    const res = await fetch('/api/admin/data', {
        method: 'POST',
        headers: adminHeaders(customEmail || _adminEmail),
        body: JSON.stringify({ action, ...data }),
    });
    if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
    return res.json();
}

// ── Stats ──
export async function getAdminStats() {
    return adminGet('stats') as Promise<{
        totalUsers: number;
        totalPosts: number;
        totalArticles: number;
        totalScenarios: number;
        totalPhrases: number;
        totalTokens: number;
    }>;
}

// ── Users ──
export async function getAllUsers(): Promise<UserProfile[]> {
    const data = await adminGet('users');
    return data.users || [];
}

// ── User Details ──
export async function getUserSavedPhrases(userId: string) {
    const data = await adminGet('user-phrases', { userId });
    return (data.phrases || []).map((p: any) => ({
        ...p,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    }));
}

export async function getUserScenarios(userId: string): Promise<UserScenario[]> {
    const data = await adminGet('user-scenarios', { userId });
    return (data.scenarios || []).map((s: any) => ({
        ...s,
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
    }));
}

export async function getUserPosts(userId: string): Promise<UserPost[]> {
    const data = await adminGet('user-posts', { userId });
    return (data.posts || []).map((p: any) => ({
        ...p,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    }));
}

export async function getUserTokenUsage(userEmail: string): Promise<{
    total: number;
    calls: number;
    byEndpoint: UserTokenUsage[];
}> {
    return adminGet('user-tokens', { email: userEmail });
}

// ── Learning Settings ──
export async function getLearningCycleSettings(): Promise<LearningCycleSettings> {
    return adminGet('learning-settings');
}

export async function updateLearningCycleSettings(settings: LearningCycleSettings): Promise<void> {
    await adminPost('update-learning-settings', { settings });
}

// ── Mutations ──
export async function deletePost(postId: string): Promise<void> {
    await adminPost('delete-post', { postId });
}

export async function bulkDeleteAllPosts(): Promise<{ deleted: number; errors: string[] }> {
    return adminPost('bulk-delete-posts');
}

export async function bulkDeleteAllArticles(): Promise<{ deleted: number; errors: string[] }> {
    return adminPost('bulk-delete-articles');
}

export async function createPostWithComments(input: any): Promise<string> {
    const data = await adminPost('create-post-with-comments', { input });
    return data.postId;
}

export async function updatePost(postId: string, data: Record<string, any>, email?: string): Promise<void> {
    await adminPost('update-post', { postId, data }, email);
}

// ── Token Usage ──
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

export async function getTokenUsageStats(daysBack: number = 30) {
    return adminGet('token-stats', { days: String(daysBack) });
}

export async function getDetailedTokenUsage(limitCount: number = 100, todayOnly: boolean = false): Promise<DetailedTokenEntry[]> {
    const data = await adminGet('token-detailed', {
        limit: String(limitCount),
        todayOnly: String(todayOnly),
    });
    return (data.entries || []).map((e: any) => ({
        ...e,
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    }));
}
