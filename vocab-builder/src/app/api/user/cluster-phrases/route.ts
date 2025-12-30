import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Cluster phrases by semantic similarity for debate grouping
 * Groups related phrases together (max 4 per cluster) for coherent debate topics
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface ClusterPhrasesRequest {
    phrases: Array<{
        phraseId: string;
        phrase: string;
        meaning: string;
    }>;
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: ClusterPhrasesRequest = await request.json();
        const { phrases } = body;

        if (!phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        // If only 1-4 phrases, no need to cluster
        if (phrases.length <= 4) {
            return NextResponse.json({
                clusters: [{
                    topic: 'General',
                    phrases: phrases,
                }],
            });
        }

        const phraseList = phrases.map((p, i) => `${i + 1}. "${p.phrase}" - ${p.meaning}`).join('\n');

        const prompt = `Group phrases by semantic similarity (max 4 per group).

${phraseList}

JSON only: {"c":[{"t":"topic","i":[1,3]}]}
Rules: Every phrase in exactly 1 group. Single phrases OK.`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300, // Reduced from 500 - compact output
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            // Fallback: chunk into groups of 4
            return NextResponse.json({
                clusters: chunkPhrases(phrases, 4),
            });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'cluster-phrases',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            console.error('JSON parse error:', text);
            // Fallback: chunk into groups of 4
            return NextResponse.json({
                clusters: chunkPhrases(phrases, 4),
            });
        }

        // Normalize short keys: c -> clusters, t -> topic, i -> phraseIndices
        const rawClusters = parsed.c || parsed.clusters || [];

        // Convert indices to actual phrases
        const clusters = rawClusters.map((cluster: { t?: string; topic?: string; i?: number[]; phraseIndices?: number[] }) => ({
            topic: cluster.t || cluster.topic || 'General',
            phrases: (cluster.i || cluster.phraseIndices || [])
                .map((idx: number) => phrases[idx - 1]) // 1-indexed to 0-indexed
                .filter(Boolean), // Remove any undefined
        }));

        // Validate all phrases are included
        const includedIds = new Set(clusters.flatMap((c: { phrases: Array<{ phraseId: string }> }) => c.phrases.map((p: { phraseId: string }) => p.phraseId)));
        const missingPhrases = phrases.filter(p => !includedIds.has(p.phraseId));

        if (missingPhrases.length > 0) {
            // Add missing phrases to first cluster or create new one
            if (clusters.length > 0 && clusters[0].phrases.length < 4) {
                clusters[0].phrases.push(...missingPhrases);
            } else {
                clusters.push({
                    topic: 'Additional Topics',
                    phrases: missingPhrases,
                });
            }
        }

        return NextResponse.json({ clusters });

    } catch (error) {
        console.error('Cluster phrases error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Fallback function to chunk phrases
function chunkPhrases<T>(arr: T[], size: number): { topic: string; phrases: T[] }[] {
    const chunks: { topic: string; phrases: T[] }[] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push({
            topic: `Group ${chunks.length + 1}`,
            phrases: arr.slice(i, i + size),
        });
    }
    return chunks;
}
