import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Process article content using Gemini 3 Flash
 * - Extracts IELTS-focused phrases with meanings + optional collocations
 * - Translates title and content to Vietnamese
 * Admin-only endpoint
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Base URL for native API
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        if (!isAdmin(email)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'Gemini API key not configured' },
                { status: 500 }
            );
        }

        const { title, content } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        const prompt = `You are a vocabulary expert for English learners. Analyze this article and extract useful phrases.

ARTICLE TITLE: "${title || ''}"
ARTICLE CONTENT:
"""
${content.substring(0, 50000)}
"""

TASK:
1. Identify the article's main topic
2. Extract 15-25 phrases that are:
   - Collocations, discourse markers, academic expressions, or topic-specific vocabulary
   - Widely used in formal English (academic writing or professional speaking)
   - Relevant to the article's topic
   
For each phrase:
- phrase: The exact phrase
- meaning: Clear, concise definition
- example: Natural usage example (can use from article or create new)
- mode: "spoken" if more common in speaking, "written" if more common in writing, "neutral" if both
- topics: 1-2 relevant topics
- commonUsages: Related collocations or phrasal verbs (MAX 3, empty array if none exist naturally)
  - Each: { phrase, meaning, example, type: "collocation"|"phrasal_verb"|"idiom"|"expression", mode, topics }

CRITICAL RULES:
- Only include commonUsages if they genuinely exist and are common
- Empty commonUsages array is perfectly fine for standalone phrases
- Focus on phrases that sound natural and educated, not textbook
- Vary types: include markers ("on the other hand"), collocations ("drive growth"), expressions ("in light of")

Return JSON:
{
  "detectedTopic": "Topic name",
  "phrases": [
    {
      "phrase": "drive economic growth",
      "meaning": "To be the main cause of economic development",
      "example": "Technology continues to drive economic growth in Asia.",
      "mode": "written",
      "topics": ["economics", "business"],
      "commonUsages": []
    }
  ],
  "translatedTitle": "Vietnamese title",
  "translatedContent": "Vietnamese content (HTML preserved)"
}`;

        const response = await fetch(`${GEMINI_BASE_URL}/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    maxOutputTokens: 8192,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini process-article error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to process article: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Log token usage
        if (data.usageMetadata) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email || 'admin',
                endpoint: 'admin-process-article',
                model: 'gemini-3-flash-preview',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            const parsed = JSON.parse(text);

            // Validate and clean phrases
            const validTypes = ['collocation', 'phrasal_verb', 'idiom', 'expression'];
            const phrases = (parsed.phrases || []).map((p: {
                phrase: string;
                meaning: string;
                example?: string;
                mode?: string;
                topics?: string[];
                commonUsages?: Array<{
                    phrase: string;
                    meaning: string;
                    example?: string;
                    type?: string;
                    mode?: string;
                    topics?: string[];
                }>;
            }) => ({
                phrase: p.phrase,
                meaning: p.meaning,
                example: p.example || '',
                mode: p.mode || 'neutral',
                topics: Array.isArray(p.topics) ? p.topics : [],
                commonUsages: (p.commonUsages || []).slice(0, 3).map(u => ({
                    phrase: u.phrase,
                    meaning: u.meaning,
                    example: u.example || '',
                    type: validTypes.includes(u.type || '') ? u.type : 'expression',
                    mode: u.mode || 'neutral',
                    topics: Array.isArray(u.topics) ? u.topics : [],
                })),
            }));

            return NextResponse.json({
                detectedTopic: parsed.detectedTopic || 'General',
                phrases,
                translatedTitle: parsed.translatedTitle || '',
                translatedContent: parsed.translatedContent || '',
                success: true
            });
        } catch (error) {
            console.error('Failed to parse process-article JSON:', error, 'Raw text:', text);
            return NextResponse.json({ error: 'Failed to parse AI response', success: false }, { status: 500 });
        }

    } catch (error) {
        console.error('Process article error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
