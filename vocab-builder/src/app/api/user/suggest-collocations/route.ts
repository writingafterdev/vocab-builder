import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Context-aware collocation suggestions using AI (DeepSeek)
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface SuggestCollocationsRequest {
    word: string;
    context: string;
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

        const body: SuggestCollocationsRequest = await request.json();
        const { word, context } = body;

        if (!word || word.trim().length === 0) {
            return NextResponse.json({ error: 'Word is required' }, { status: 400 });
        }

        if (!context || context.trim().length === 0) {
            return NextResponse.json({ error: 'Context is required' }, { status: 400 });
        }

        const prompt = `You are a linguistics expert helping an English learner understand a word they highlighted.

WORD: "${word}"
CONTEXT: "${context}"

TASKS:
1. Find the ROOT/LEMMA (e.g., "leveraging" → "leverage")
2. Get the MEANING in this specific context
3. Create a NATURAL EXAMPLE SENTENCE
4. Assign 1-3 TOPICS from: business, career, finance, academic, science, education, daily_life, relationships, family, travel, entertainment, sports, technology, media, health, environment, politics, culture
5. Determine MODE: "spoken" (casual), "written" (formal), or "neutral"

6. Suggest 1-2 COMMON COLLOCATIONS or idiomatic expressions using this word
   - Fixed combinations like: "make a decision", "heavy rain", "take notes"
   - Should be expressions native speakers commonly use
   
7. Suggest 1-2 PHRASAL VERBS if the word is a verb
   - Verb + particle combinations: "run out of", "look up", "give up"
   - Should be commonly used in everyday English

For each suggestion provide: phrase, meaning, ex (example sentence), mode, topics

Return JSON:
{
    "rootWord": "base form",
    "meaning": "Clear definition",
    "ex": "Example sentence",
    "mode": "spoken/written/neutral",
    "topics": ["topic1"],
    "collocations": [{"phrase": "...", "meaning": "...", "ex": "...", "mode": "neutral", "topics": ["..."]}],
    "phrasalVerbs": [{"phrase": "...", "meaning": "...", "ex": "...", "mode": "neutral", "topics": ["..."]}]
}

RULES:
- Suggest common expressions that learners would benefit from knowing
- If the word has no common collocations/phrasal verbs, return empty arrays
- Focus on frequently-used expressions, not obscure ones`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 600,
                temperature: 0.3,
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
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean and parse JSON
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return NextResponse.json({
                meaning: 'A common English expression',
                mode: 'neutral',
                topics: [],
                collocations: [],
                phrasalVerbs: [],
                rootWord: word,
            });
        }

        // Process collocations (max 2)
        const collocations = (parsed.collocations || [])
            .slice(0, 2)
            .map((c: { phrase: string; meaning: string; ex?: string; example?: string; mode?: string; topics?: string[] }) => ({
                phrase: c.phrase,
                meaning: c.meaning,
                example: c.ex || c.example || '',
                mode: c.mode || 'neutral',
                topics: Array.isArray(c.topics) ? c.topics : [],
            }));

        // Process phrasal verbs (max 2)
        const phrasalVerbs = (parsed.phrasalVerbs || [])
            .slice(0, 2)
            .map((p: { phrase: string; meaning: string; ex?: string; example?: string; mode?: string; topics?: string[] }) => ({
                phrase: p.phrase,
                meaning: p.meaning,
                example: p.ex || p.example || '',
                mode: p.mode || 'neutral',
                topics: Array.isArray(p.topics) ? p.topics : [],
            }));

        return NextResponse.json({
            meaning: parsed.meaning || 'A common English expression',
            example: parsed.ex || parsed.example || '',
            mode: parsed.mode || 'neutral',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            collocations,
            phrasalVerbs,
            rootWord: parsed.rootWord || word,
        });

    } catch (error) {
        console.error('Suggest collocations error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
