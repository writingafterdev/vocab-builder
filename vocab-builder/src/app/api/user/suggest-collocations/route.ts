import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { safeParseAIJson } from '@/lib/ai-utils';

/**
 * Layered vocabulary generation - generates immediate children only (1 layer)
 * 
 * TWO TYPES OF LAYER 1 CHILDREN:
 * 1. COMMON USAGES - How native speakers use this word in phrases/collocations
 *    Example: "happy" → "happy ending", "happy hour"
 * 
 * 2. DIFFERENT CONNOTATIONS - Same meaning but different sentiment/emotional tone
 *    Example: "happy" → "joyful" (more intense), "content" (calmer)
 * 
 * After Layer 1 items appear in an exercise, they become independent phrases
 * with their own tags (Register, Connotation, Topic, etc.) and SRS schedule.
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

interface SuggestCollocationsRequest {
    word: string;
    context: string;
    layer?: number;  // 0 = generating Layer 1 (from root), 1+ = generating Layer 2+ (from child)
}

export async function POST(request: NextRequest) {
    try {
        // Secure authentication
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        const userEmail = authUser?.userEmail || request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: SuggestCollocationsRequest = await request.json();
        const { word, context, layer = 0 } = body;

        if (!word?.trim() || !context?.trim()) {
            return NextResponse.json({ error: 'Word and context required' }, { status: 400 });
        }

        // Layer 0 → Layer 1: generate both usages AND connotations
        // Layer 1+ → Layer 2+: generate ONLY usages (no connotations)
        const includeConnotations = layer === 0;

        const prompt = `You are a linguistics expert helping build a vocabulary learning system.

WORD/PHRASE: "${word}"
CONTEXT: "${context}"

Generate the IMMEDIATE CHILDREN for this vocabulary item.

${includeConnotations ? `## TWO TYPES OF CHILDREN:

### 1. COMMON USAGES (2-3 max)
How native speakers actually USE this word in phrases/collocations.
- Natural word combinations
- Common expressions containing this word
- Example: "deadline" → "meet a deadline", "tight deadline", "miss the deadline"

### 2. DIFFERENT CONNOTATIONS (1-2 max)
Words/phrases with the SAME MEANING but DIFFERENT sentiment/emotional tone.
- Positive ↔ Negative ↔ Neutral shifts
- Example: "happy" → "joyful" (more intense positive), "content" (calmer neutral)
- Example: "cheap" → "affordable" (positive spin), "stingy" (negative)` : `## COMMON USAGES ONLY (2-3 max)
How native speakers actually USE this word in phrases/collocations.
- Natural word combinations
- Common expressions containing this word
- Example: "deadline" → "meet a deadline", "tight deadline", "miss the deadline"

NOTE: Do NOT generate connotation variants for this item.`}

CRITICAL RULES:
- All suggestions must match the SAME core MEANING as in the given context
- Quality over quantity - empty arrays are fine if nothing fits well
- isSingleWord: true if the child is a single word (can spawn its own children later)

Return JSON:
{
    "rootWord": "base/dictionary form",
    "meaning": "definition in this context",
    "usages": [
        {
            "phrase": "meet a deadline",
            "meaning": "to complete something before the required time",
            "isSingleWord": false
        }
    ]${includeConnotations ? `,
    "connotations": [
        {
            "phrase": "time limit",
            "meaning": "the final moment allowed (more neutral/formal)",
            "isSingleWord": false
        }
    ]` : ''}
}`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 600,
                temperature: 0.3,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'suggest-collocations',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean and parse JSON
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        const parseResult = safeParseAIJson<{ meaning?: string; rootWord?: string; usages?: Array<{ phrase: string; meaning: string; isSingleWord?: boolean }>; connotations?: Array<{ phrase: string; meaning: string; isSingleWord?: boolean }> }>(text);
        if (!parseResult.success) {
            return NextResponse.json({
                meaning: 'A common English expression',
                commonUsages: [],
                rootWord: word,
            });
        }
        parsed = parseResult.data;

        // Transform to potentialUsages format with proper typing
        const potentialUsages: Array<{
            phrase: string;
            meaning: string;
            type: 'usage' | 'connotation';
            isSingleWord: boolean;
        }> = [];

        // Add usages (type: 'usage')
        (parsed.usages || []).slice(0, 3).forEach((u: { phrase: string; meaning: string; isSingleWord?: boolean }) => {
            potentialUsages.push({
                phrase: u.phrase,
                meaning: u.meaning,
                type: 'usage',
                isSingleWord: u.isSingleWord || false,
            });
        });

        // Add connotations (type: 'connotation')
        (parsed.connotations || []).slice(0, 2).forEach((c: { phrase: string; meaning: string; isSingleWord?: boolean }) => {
            potentialUsages.push({
                phrase: c.phrase,
                meaning: c.meaning,
                type: 'connotation',
                isSingleWord: c.isSingleWord || false,
            });
        });

        // Also return in old commonUsages format for backward compatibility
        const commonUsages = potentialUsages.map(p => ({
            phrase: p.phrase,
            meaning: p.meaning,
            type: p.type === 'usage' ? 'collocation' : 'expression',
        }));

        return NextResponse.json({
            meaning: parsed.meaning || 'A common English expression',
            rootWord: parsed.rootWord || word,
            commonUsages,
            potentialUsages,  // New format with proper typing
        });

    } catch (error) {
        console.error('Suggest collocations error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
