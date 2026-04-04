import { NextRequest, NextResponse } from 'next/server';
import { runQuery, addDocument, serverTimestamp, setDocument, getDocument, updateDocument } from '@/lib/appwrite/database';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import type { SavedPhrase } from '@/lib/db/types';

const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

// ─── Types ────────────────────────────────────────────

interface ClusterGroup {
    theme: string;
    context: string;
    pragmatics: { register: string; relationship: string };
    phraseIds: string[];
    phrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
        register?: string;
        topics?: string[];
    }>;
}

interface GeneratedSection {
    id: string;
    content: string;
    vocabPhrases: string[]; // phrases used in this section
}

interface ComprehensionQuestion {
    id: string;
    afterSectionId: string;
    question: string;
    options: string[];
    correctIndex: number;
    targetPhrase: string;
    explanation: string;
}

interface GeneratedSession {
    id?: string;
    userId: string;
    title: string;
    subtitle: string;
    sections: GeneratedSection[];
    questions: ComprehensionQuestion[];
    quotes: Array<{
        text: string;
        highlightedPhrases: string[];
    }>;
    phraseIds: string[];
    totalPhrases: number;
    status: 'generated' | 'in_progress' | 'completed';
    createdAt: string;
    isListeningDay: boolean;
    reviewDayIndex: number;
}

// ─── Main Handler ─────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');
        
        const authHeader = request.headers.get('Authorization');
        const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (authHeader || undefined);

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json(
                { error: 'AI API key not configured' },
                { status: 500 }
            );
        }

        // Step 1: Get user stats to determine Reading vs. Listening Day
        const userDoc = (await getDocument('users', userId)) as { stats?: { reviewDayCount?: number } } | null;
        const currentCount = userDoc?.stats?.reviewDayCount || 0;
        const reviewDayIndex = currentCount + 1;
        const isListeningDay = reviewDayIndex % 2 !== 0; // Odd days = listening, Even days = reading

        // Step 2: Get due phrases
        const duePhrases = await fetchDuePhrases(userId);

        if (duePhrases.length === 0) {
            return NextResponse.json({
                error: 'No phrases due for review',
                suggestion: 'Keep reading and saving new phrases!',
            }, { status: 400 });
        }

        // Step 3: Cluster the due phrases
        const clusters = clusterPhrasesByTopic(duePhrases);

        // Step 3: Generate merged article from all clusters
        const articleResult = await generateMergedArticle(clusters, userId, request);

        if (!articleResult) {
            return NextResponse.json(
                { error: 'Failed to generate article' },
                { status: 500 }
            );
        }

        // Step 4: Store in Appwrite
        // Map to existing generatedSessions schema:
        //   content  → sections (JSON string)
        //   phrases  → phraseIds (JSON string)
        //   questions → questions (JSON string)
        //   subtopic → subtitle
        //   topic    → quotes (JSON string, repurposed)
        const sessionData = {
            userId,
            title: articleResult.title,
            subtopic: articleResult.subtitle,
            content: JSON.stringify(articleResult.sections),
            questions: JSON.stringify(articleResult.questions),
            topic: JSON.stringify(articleResult.quotes),
            phrases: JSON.stringify(duePhrases.map(p => p.id)),
            totalPhrases: duePhrases.length,
            status: 'generated',
            createdAt: serverTimestamp(),
            isListeningDay,
            reviewDayIndex,
        };

        const docId = `session${userId.substring(0, 10)}${Date.now()}`;
        await setDocument('generatedSessions', docId, sessionData);

        // Update the user's reviewDayCount
        try {
            const userDocForStats = await getDocument('users', userId) as any;
            if (userDocForStats) {
                const stats = typeof userDocForStats.stats === 'string' ? JSON.parse(userDocForStats.stats) : (userDocForStats.stats || {});
                stats.reviewDayCount = reviewDayIndex;
                await updateDocument('users', userId, { stats: JSON.stringify(stats) });
            }
        } catch (e) {
            console.warn('Failed to update reviewDayCount:', e);
        }

        // Step 6: Store extracted quotes in the global quotes bank for the feed
        for (const quote of articleResult.quotes) {
            try {
                await addDocument('quotes', {
                    userId,
                    sessionId: docId,
                    text: quote.text,
                    highlightedPhrases: JSON.stringify(quote.highlightedPhrases || []),
                    sourceType: 'generated_session',
                    postTitle: articleResult.title,
                    author: 'VocabBuilder AI',
                    topic: 'general',
                    source: 'Community Practice',
                    createdAt: serverTimestamp(),
                });
            } catch (quoteErr) {
                console.warn('Failed to store quote (non-fatal):', quoteErr);
            }
        }

        return NextResponse.json({
            sessionId: docId,
            title: articleResult.title,
            subtitle: articleResult.subtitle,
            sectionCount: articleResult.sections.length,
            questionCount: articleResult.questions.length,
            quoteCount: articleResult.quotes.length,
            phraseCount: duePhrases.length,
            isListeningDay,
            reviewDayIndex,
        });

    } catch (error) {
        console.error('Generate session article error:', error);
        return NextResponse.json(
            { error: 'Failed to generate session article' },
            { status: 500 }
        );
    }
}

// ─── Fetch Due Phrases ────────────────────────────────

async function fetchDuePhrases(userId: string): Promise<SavedPhrase[]> {
    const allPhrases = await runQuery(
        'savedPhrases',
        [{ field: 'userId', op: 'EQUAL', value: userId }],
        100
    ) as unknown as SavedPhrase[];

    if (!allPhrases || allPhrases.length === 0) return [];

    const now = new Date();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const getMs = (t: unknown): number => {
        if (!t) return 0;
        if (typeof t === 'string') return new Date(t).getTime();
        if (typeof t === 'object' && t !== null && 'toMillis' in t &&
            typeof (t as { toMillis: () => number }).toMillis === 'function') {
            return (t as { toMillis: () => number }).toMillis();
        }
        if (t instanceof Date) return t.getTime();
        // Handle Firestore REST {_seconds, _nanoseconds}
        if (typeof t === 'object' && t !== null && '_seconds' in t) {
            return (t as { _seconds: number })._seconds * 1000;
        }
        return 0;
    };

    const duePhrases = allPhrases.filter(p => {
        const reviewMs = getMs(p.nextReviewDate);
        // Include if due today or overdue, or never reviewed
        return reviewMs === 0 || reviewMs <= endOfToday.getTime();
    });

    // Sort: most overdue first
    duePhrases.sort((a, b) => getMs(a.nextReviewDate) - getMs(b.nextReviewDate));

    // Cap at 20 phrases max per session
    return duePhrases.slice(0, 20);
}

// ─── Deterministic Clustering ─────────────────────────

interface SimpleCluster {
    topic: string;
    register: string;
    phrases: SavedPhrase[];
}

function clusterPhrasesByTopic(phrases: SavedPhrase[]): SimpleCluster[] {
    const groups = new Map<string, SavedPhrase[]>();

    for (const phrase of phrases) {
        const topic = phrase.topics?.[0] || 'general';
        const register = phrase.register || 'consultative';
        const key = `${topic}__${register}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(phrase);
    }

    // Merge small groups (< 2 phrases) into 'mixed' group
    const clusters: SimpleCluster[] = [];
    const mixed: SavedPhrase[] = [];

    for (const [key, groupPhrases] of groups) {
        const [topic, register] = key.split('__');
        if (groupPhrases.length >= 2) {
            clusters.push({ topic, register, phrases: groupPhrases });
        } else {
            mixed.push(...groupPhrases);
        }
    }

    if (mixed.length > 0) {
        clusters.push({
            topic: 'mixed',
            register: 'consultative',
            phrases: mixed,
        });
    }

    return clusters;
}

// ─── AI Article Generation ────────────────────────────

async function generateMergedArticle(
    clusters: SimpleCluster[],
    userId: string,
    request: NextRequest
): Promise<{
    title: string;
    subtitle: string;
    sections: GeneratedSection[];
    questions: ComprehensionQuestion[];
    quotes: Array<{ text: string; highlightedPhrases: string[] }>;
} | null> {
    // Build phrase inventory for the prompt
    const allPhrases = clusters.flatMap(c => c.phrases);
    const phraseInventory = allPhrases.map(p =>
        `- "${p.phrase}" (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
    ).join('\n');

    // Build cluster context for natural transitions
    const clusterDescriptions = clusters.map((c, i) =>
        `Group ${i + 1} [${c.topic}/${c.register}]: ${c.phrases.map(p => `"${p.phrase}"`).join(', ')}`
    ).join('\n');

    // Determine article length based on phrase count
    const phraseCount = allPhrases.length;
    const wordTarget = phraseCount <= 5 ? '400-600' :
                       phraseCount <= 10 ? '600-900' :
                       phraseCount <= 15 ? '900-1200' : '1200-1500';

    const questionsTarget = Math.min(Math.ceil(phraseCount * 0.6), 8);

    const prompt = `You are a Substack-style writer creating a compelling, highly philosophical, and immersive article. Your articles get readers hooked from the first line, explore deep themes rather than simple daily scenarios, and teach vocabulary through profound CONTEXT — never through definitions.

PHRASES TO WEAVE IN:
${phraseInventory}

THEMATIC GROUPS:
${clusterDescriptions}

YOUR TASK: Write ONE cohesive article that naturally incorporates ALL the phrases above. The article should feel like a real Substack post — engaging, opinionated, deeply insightful, and intellectually rich.

CRITICAL RULES:

1. **STRUCTURE**: The article must flow through the thematic groups NATURALLY. Avoid mundane "day in the life" stories; aim for deep cultural commentary, philosophical exploration, or fascinating historical narratives.

2. **CONTEXT LAYERING** (for each phrase):
   - BEFORE: Set up the situation so the phrase feels inevitable
   - PHRASE: Appears naturally in narration or dialogue
   - AFTER: Show the consequence or reaction — making meaning obvious

3. **TONE**: Write like a real person, not a textbook. Be:
   - Observant and slightly irreverent
   - Specific (concrete details, not vague abstractions)
   - Emotionally engaging (stakes, tension, curiosity)

4. **LENGTH**: ${wordTarget} words, divided into 3-6 sections.

5. **COMPREHENSION QUESTIONS** (${questionsTarget} total):
   Each question tests understanding of a specific phrase through story comprehension — NEVER ask for definitions.
   
   Question types to use:
   - "Why did [character] react that way when..." (tests inference)
   - "What happens next after [character] says..." (tests consequence prediction)
   - "[Character] chose to say X instead of Y because..." (tests register/pragmatic awareness)
   - "Based on the situation, what was [character] really trying to communicate?" (tests subtext)

6. **EXTRACTABLE QUOTES**: 
   You MUST extract 3 profound, beautiful, standalone sentences from your article. 
   - These quotes MUST contain at least one of the TARGET PHRASES.
   - The sentence surrounding the phrase must be staggeringly rich in meaning and perfectly quotable. 
   - A boring sentence that happens to contain the phrase is unacceptable.

RESPOND IN JSON:
{
  "title": "A catchy, Substack-worthy title (not 'Vocabulary Practice', must sound like a real essay title)",
  "subtitle": "A compelling one-line hook",
  "sections": [
    {
      "id": "section_1",
      "content": "The full text of this section (multiple paragraphs OK)",
      "vocabPhrases": ["phrase1", "phrase2"]
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "afterSectionId": "section_2",
      "question": "Story-based comprehension question",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1,
      "targetPhrase": "the phrase being tested",
      "explanation": "Brief, conversational explanation (like a friend, not a teacher)"
    }
  ],
  "quotes": [
    {
      "text": "A profoundly insightful, standalone sentence from the article",
      "highlightedPhrases": ["phrase that appears in this exact quote"]
    }
  ]
}`;

    try {
        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-non-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an award-winning Substack writer who teaches vocabulary through immersive storytelling. You respond ONLY in valid JSON. Your writing is vivid, opinionated, and emotionally engaging.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: request.headers.get('x-user-email') || 'anonymous',
                endpoint: 'generate-session-article',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parseResult = safeParseAIJson<{
            title: string;
            subtitle: string;
            sections: GeneratedSection[];
            questions: ComprehensionQuestion[];
            quotes: Array<{ text: string; highlightedPhrases: string[] }>;
        }>(content);

        if (!parseResult.success) {
            console.error('Failed to parse AI article:', parseResult.error);
            return null;
        }

        const article = parseResult.data;

        // Validate and clean up
        if (!article.sections || article.sections.length === 0) {
            console.error('AI returned empty sections');
            return null;
        }

        // Ensure section IDs exist
        article.sections = article.sections.map((s, i) => ({
            ...s,
            id: s.id || `section_${i + 1}`,
            vocabPhrases: s.vocabPhrases || [],
        }));

        // Ensure question IDs and refs
        article.questions = (article.questions || []).map((q, i) => ({
            ...q,
            id: q.id || `q_${i + 1}`,
            afterSectionId: q.afterSectionId || article.sections[Math.min(i, article.sections.length - 1)].id,
        }));

        // Ensure quotes
        article.quotes = (article.quotes || []).slice(0, 3);

        return article;

    } catch (error) {
        console.error('AI article generation failed:', error);
        return null;
    }
}
