import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { updateDocument } from '@/lib/firestore-rest';

/**
 * Batch Process Article — Single Grok (xAI) call that does everything:
 * 1. Extract highlighted phrases (phrase list)
 * 2. Generate phrase data (meanings, collocations, examples)
 * 3. Extract topic vocabulary + lexile assessment
 * 4. Generate reading sections for swipe mode
 * 5. Detect topic
 *
 * Replaces 4 separate API calls with 1.
 * Audio TTS remains separate (different API/model).
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;
        const authHeader = request.headers.get('Authorization');
        const cronSecret = process.env.CRON_SECRET;

        const isAuthorized = isAdmin(email) || (cronSecret && authHeader === `Bearer ${cronSecret}`);
        if (!isAuthorized) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'xAI API key not configured. Set XAI_API_KEY env var.' }, { status: 500 });
        }

        const { postId, title, content } = await request.json();

        if (!postId || !content || typeof content !== 'string') {
            return NextResponse.json({ error: 'postId, title, and content are required' }, { status: 400 });
        }

        // ═══ Single comprehensive prompt ═══
        const prompt = `You are an expert English language teacher and reading experience designer. Analyze this article comprehensively.

ARTICLE TITLE: "${title || 'Untitled'}"
ARTICLE CONTENT:
"""
${content.substring(0, 50000)}
"""

Perform ALL of the following tasks in ONE response:

━━━ TASK 1: PHRASE EXTRACTION ━━━
Extract 15-25 phrases that are useful for English learners:
- Collocations (e.g., "drive growth", "make a decision")
- Discourse markers (e.g., "on the other hand", "in light of")
- Academic expressions, idioms, phrasal verbs
- Topic-specific vocabulary phrases (2+ words)
Return as a flat string array called "highlightedPhrases".

━━━ TASK 2: PHRASE DATA ━━━
For the SAME phrases, generate detailed data:
- phrase: exact phrase
- meaning: clear, concise definition
- example: natural usage example
- mode: "spoken" | "written" | "neutral"
- topics: 1-2 relevant topic tags
- commonUsages: up to 3 related collocations/expressions (empty array if none):
  - { phrase, meaning, example, type: "collocation"|"phrasal_verb"|"idiom"|"expression", mode, topics }

━━━ TASK 3: TOPIC VOCABULARY + LEXILE ━━━
Extract 10-20 vocabulary items (single words AND phrases):
- Domain-specific terms (B2-C2 level)
- Include partOfSpeech: "noun"|"verb"|"adjective"|"adverb"|"phrase"
- Include frequency: "common"|"intermediate"|"advanced"
- Include example sentence

Also assess reading difficulty:
- level: "easy"|"medium"|"hard"
- score: 400-1600 Lexile score
- reasoning: brief explanation

━━━ TASK 4: READING SECTIONS ━━━
Divide the article into 3-8 logical sections for a card-based swipe reading interface:
- Each section ~100-250 words
- Split at natural breakpoints (not mid-sentence)
- Include the original HTML formatting
- Extract 2-5 notable vocab phrases per section
- Generate a one-line subtitle/caption for the article

━━━ TASK 5: TOPIC DETECTION ━━━
Identify the article's main topic (1-2 words, e.g., "Technology", "Climate Science").

Return ONLY valid JSON with this structure:
{
  "detectedTopic": "Topic Name",
  "highlightedPhrases": ["phrase1", "phrase2"],
  "phraseData": [
    {
      "phrase": "drive economic growth",
      "meaning": "To be the main cause of economic development",
      "example": "Technology continues to drive economic growth.",
      "mode": "written",
      "topics": ["economics"],
      "commonUsages": []
    }
  ],
  "topicVocab": [
    {
      "word": "sustainability",
      "meaning": "The ability to maintain at a certain level",
      "partOfSpeech": "noun",
      "topic": "environment",
      "frequency": "intermediate",
      "example": "The company prioritizes sustainability."
    }
  ],
  "lexile": {
    "level": "medium",
    "score": 1050,
    "reasoning": "Uses academic vocabulary with complex sentence structures"
  },
  "subtitle": "A compelling one-line summary of the article",
  "sections": [
    {
      "title": "Optional section title or null",
      "content": "<p>HTML content for this section...</p>",
      "vocabPhrases": ["phrase one", "phrase two"]
    }
  ]
}`;

        const response = await fetch(XAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a linguistics and reading experience expert. Always respond with valid JSON only. No markdown, no code fences, just the JSON object.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 16384,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[BatchProcess] Grok error:', response.status, errorText);
            return NextResponse.json({ error: `Grok API failed: ${response.status}` }, { status: 500 });
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'cron',
                endpoint: 'admin-batch-process',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Parse and validate
        let parsed;
        try {
            let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(cleanText);
        } catch (error) {
            console.error('[BatchProcess] JSON parse failed:', error, 'Raw:', text.slice(0, 500));
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        // ═══ Validate & clean data ═══

        const validTypes = ['collocation', 'phrasal_verb', 'idiom', 'expression'];
        const validPOS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'];
        const validFreq = ['common', 'intermediate', 'advanced'];
        const validLevels = ['easy', 'medium', 'hard'];

        const highlightedPhrases: string[] = (parsed.highlightedPhrases || [])
            .filter((p: any) => typeof p === 'string' && p.length > 0);

        const phraseData = (parsed.phraseData || []).map((p: any) => ({
            phrase: p.phrase,
            meaning: p.meaning,
            example: p.example || '',
            mode: p.mode || 'neutral',
            topics: Array.isArray(p.topics) ? p.topics : [],
            commonUsages: (p.commonUsages || []).slice(0, 3).map((u: any) => ({
                phrase: u.phrase,
                meaning: u.meaning,
                example: u.example || '',
                type: validTypes.includes(u.type) ? u.type : 'expression',
                mode: u.mode || 'neutral',
                topics: Array.isArray(u.topics) ? u.topics : [],
            })),
        }));

        const topicVocab = (parsed.topicVocab || [])
            .filter((v: any) => v.word && v.meaning)
            .map((v: any) => ({
                word: v.word.toLowerCase().trim(),
                meaning: v.meaning,
                partOfSpeech: validPOS.includes(v.partOfSpeech) ? v.partOfSpeech : 'noun',
                topic: v.topic || parsed.detectedTopic || 'general',
                frequency: validFreq.includes(v.frequency) ? v.frequency : 'intermediate',
                example: v.example || '',
            }));

        const lexile = parsed.lexile ? {
            level: validLevels.includes(parsed.lexile.level) ? parsed.lexile.level : 'medium',
            score: typeof parsed.lexile.score === 'number' ? parsed.lexile.score : 1000,
            reasoning: parsed.lexile.reasoning || '',
        } : { level: 'medium', score: 1000, reasoning: '' };

        const sections = (parsed.sections || []).map((s: any, i: number) => ({
            id: `section-${i}`,
            title: s.title || undefined,
            content: s.content || '',
            vocabPhrases: Array.isArray(s.vocabPhrases) ? s.vocabPhrases : [],
        }));

        // ═══ Save everything to Firestore at once ═══

        const updateData: Record<string, unknown> = {
            highlightedPhrases,
            phraseData,
            detectedTopic: parsed.detectedTopic || 'General',
            topicVocab,
            lexileLevel: lexile.level,
            lexileScore: lexile.score,
            subtitle: parsed.subtitle || '',
            sections,
            processingStatus: 'completed',
            processedAt: new Date().toISOString(),
            batchProcessed: true,
        };

        await updateDocument('posts', postId, updateData);

        return NextResponse.json({
            success: true,
            postId,
            detectedTopic: parsed.detectedTopic,
            phraseCount: highlightedPhrases.length,
            phraseDataCount: phraseData.length,
            vocabCount: topicVocab.length,
            sectionCount: sections.length,
            lexile,
        });
    } catch (error) {
        console.error('[BatchProcess] Error:', error);
        return NextResponse.json(
            { error: 'Batch processing failed', detail: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
