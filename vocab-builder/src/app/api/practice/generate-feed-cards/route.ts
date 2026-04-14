import { NextRequest, NextResponse } from 'next/server';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import { getWeakestTypes } from '@/lib/db/question-weaknesses';
import { FEED_CARD_TIME_ESTIMATES, SOURCE_PLATFORM_CONFIG, QUESTION_SKILL_MAP } from '@/lib/exercise/config';
import type { FeedCard, FeedCardType, SourcePlatform, SkillAxis } from '@/lib/db/types';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

const PLATFORMS: SourcePlatform[] = ['linkedin', 'whatsapp', 'twitter', 'reddit', 'email', 'cover_letter', 'yelp_review', 'news_oped'];

/**
 * POST /api/practice/generate-feed-cards
 * Generates a batch of feed cards for the QuoteSwiper injection system.
 */
export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 });
        }

        const { vocabPhrases = [], count = 5 } = await request.json();

        // Get user's weak question types to weight retry cards
        const weaknesses = await getWeakestTypes(userId);
        const hasWeaknesses = weaknesses.length > 0;

        // Decide card mix
        const cardTypes: FeedCardType[] = [];
        for (let i = 0; i < count; i++) {
            if (hasWeaknesses && i === 0) {
                cardTypes.push('retry'); // Always 1 retry if weaknesses exist
            } else if (i === count - 1) {
                cardTypes.push('fix_it'); // Last card is a session redirect
            } else {
                const pool: FeedCardType[] = ['ab_natural', 'spot_flaw', 'spot_intruder'];
                cardTypes.push(pool[Math.floor(Math.random() * pool.length)]);
            }
        }

        const platformPick = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
        const platformLabel = SOURCE_PLATFORM_CONFIG[platformPick];
        const vocabSnippet = vocabPhrases.length > 0
            ? `\nTarget vocabulary to embed naturally: ${vocabPhrases.slice(0, 5).join(', ')}`
            : '';

        const prompt = `Generate ${count} feed cards for an English vocabulary learning app.
Each card is a micro-exercise embedded in a real-world text snippet.

CARD TYPES REQUESTED: ${JSON.stringify(cardTypes)}

CARD TYPE DEFINITIONS:
- "ab_natural": Show two versions of a sentence. One sounds native, one sounds textbook. User picks the natural one. Options array has exactly 2 items.
- "spot_flaw": Show a short argument (3-4 sentences). One has a logical flaw. User picks which flaw it has from 3-4 options.
- "spot_intruder": Show a paragraph. One sentence breaks the register/tone. User picks the intruder from 3-4 options.
- "retry": Reframed version of a previously failed question type. Same format as spot_flaw.
- "fix_it": Just a source content snippet that needs fixing. No options — this redirects to a full session.

SOURCE PLATFORM: ${platformPick} (${platformLabel.emoji} ${platformLabel.label})
${vocabSnippet}

RULES:
1. sourceContent must feel like a REAL ${platformLabel.label} — use appropriate length and style, BUT:
2. TONE RULE: Unless the card type is specifically testing register (like 'ab_natural' or 'spot_intruder'), make the tone casual, internet-slangy, dramatic, or highly opinionated. ABSOLUTELY DO NOT make it formal, corporate, or professional!
3. Embed any vocab words naturally (never define them)
4. options should be 2-4 items depending on card type
5. For fix_it cards, only provide sourceContent and prompt (no options)
6. explanation should be insightful and educational (1-2 sentences)

Return JSON array:
[{
  "cardType": "${cardTypes[0]}",
  "sourceContent": "...",
  "prompt": "...",
  "options": ["...", "..."],
  "correctIndex": 0,
  "explanation": "...",
  "skillAxis": "cohesion|task_achievement|naturalness"
}]`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-non-reasoning',
                messages: [
                    { role: 'system', content: 'You generate micro-exercises for English learners. Content should feel like real social media posts, emails, and messages. Respond ONLY with valid JSON arrays.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('Feed card generation error:', response.status);
            return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'generate-feed-cards',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Parse — might be { cards: [...] } or [...]
        let rawCards: any[];
        try {
            const parsed = JSON.parse(content);
            rawCards = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.feedCards || [parsed]);
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        // Normalize into FeedCard shape
        const feedCards: FeedCard[] = rawCards.map((raw: any, i: number) => ({
            id: `feed_${Date.now()}_${i}`,
            userId,
            cardType: raw.cardType || cardTypes[i] || 'spot_flaw',
            skillAxis: (raw.skillAxis as SkillAxis) || 'task_achievement',
            sourceContent: raw.sourceContent || '',
            sourcePlatform: platformPick,
            sourceLabel: `${platformLabel.emoji} ${platformLabel.label}`,
            prompt: raw.prompt || '',
            options: raw.options || [],
            correctIndex: raw.correctIndex ?? 0,
            explanation: raw.explanation || '',
            isRetry: raw.cardType === 'retry',
            linkedSessionId: raw.cardType === 'fix_it' ? undefined : undefined,
            estimatedSeconds: FEED_CARD_TIME_ESTIMATES[raw.cardType as FeedCardType] || 30,
            createdAt: new Date().toISOString(),
        }));

        return NextResponse.json({ cards: feedCards });
    } catch (error) {
        console.error('Feed card generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
