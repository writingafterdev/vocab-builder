import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Extract topic-specific vocabulary (single words) from article content
 * Admin-only endpoint - vocabulary is stored on article and shared across all users
 * Uses AISTUDIO_API_KEY for separate billing from main app
 */

const AISTUDIO_API_KEY = process.env.AISTUDIO_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

export interface TopicVocab {
    word: string;
    meaning: string;
    partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb';
    topic: string;
    frequency: 'common' | 'intermediate' | 'advanced';
    example?: string;
}

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        // Allow any user to extract vocab (not admin-only)
        // This is on-demand generation triggered by readers

        if (!AISTUDIO_API_KEY) {
            return NextResponse.json(
                { error: 'AI Studio API key not configured' },
                { status: 500 }
            );
        }

        const { content, title, detectedTopic } = await request.json();

        if (!content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        const prompt = `Analyze this article for vocabulary, phrases, and reading level.

ARTICLE TITLE: "${title || 'Untitled'}"
DETECTED TOPIC: ${detectedTopic || 'General'}

ARTICLE CONTENT:
"""
${content.substring(0, 40000)}
"""

TASKS:

1. **VOCABULARY & PHRASE EXTRACTION**
Extract 10-20 items that are learner-valuable, including:

A) SINGLE WORDS (domain-specific):
- Technical or specialized terms related to the topic
- Intermediate to advanced vocabulary (B2-C2)
- Not basic words everyone knows

B) PHRASES & EXPRESSIONS:
- Idioms (e.g., "on the same page", "a dime a dozen")
- Collocations (e.g., "make a decision", "take action")
- Phrasal verbs (e.g., "figure out", "come up with")
- Fixed expressions (e.g., "as a matter of fact")

For each item provide:
- word: The word OR phrase exactly as it appears
- meaning: Clear, concise definition
- partOfSpeech: "noun", "verb", "adjective", "adverb", or "phrase"
- topic: The specific topic/domain
- frequency: "common", "intermediate", or "advanced"
- example: A natural usage example

2. **READING LEVEL ASSESSMENT**
Evaluate the article's reading difficulty.

Return JSON:
{
  "topicVocab": [
    {
      "word": "figure out",
      "meaning": "To understand or solve something after thinking about it",
      "partOfSpeech": "phrase",
      "topic": "general",
      "frequency": "common",
      "example": "I need to figure out how to fix this problem."
    },
    {
      "word": "database",
      "meaning": "A structured collection of data stored electronically",
      "partOfSpeech": "noun",
      "topic": "technology",
      "frequency": "intermediate",
      "example": "The company stores customer information in a database."
    }
  ],
  "lexile": {
    "level": "easy" | "medium" | "hard",
    "score": 400-1600,
    "reasoning": "Brief explanation"
  }
}

Guidelines for lexile:
- easy: 400-800 (simple vocabulary, short sentences, casual tone)
- medium: 800-1100 (standard vocabulary, moderate sentences)
- hard: 1100+ (advanced vocabulary, complex sentences)`;

        const response = await fetch(`${GEMINI_BASE_URL}/gemini-3-flash-preview:generateContent?key=${AISTUDIO_API_KEY}`, {
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
                    maxOutputTokens: 4000,
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini extract-topic-vocab error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to extract vocabulary: ${response.status}` },
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
                endpoint: 'admin-extract-topic-vocab',
                model: 'gemini-3-flash-preview',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            const parsed = JSON.parse(text);

            // Validate and clean vocabulary
            const validPOS = ['noun', 'verb', 'adjective', 'adverb'];
            const validFreq = ['common', 'intermediate', 'advanced'];
            const validLevels = ['easy', 'medium', 'hard'];

            const topicVocab: TopicVocab[] = (parsed.topicVocab || [])
                .filter((v: any) => v.word && v.meaning)
                .map((v: any) => ({
                    word: v.word.toLowerCase().trim(),
                    meaning: v.meaning,
                    partOfSpeech: validPOS.includes(v.partOfSpeech) ? v.partOfSpeech : 'noun',
                    topic: v.topic || detectedTopic || 'general',
                    frequency: validFreq.includes(v.frequency) ? v.frequency : 'intermediate',
                    example: v.example || '',
                }));

            // Parse Lexile data
            const lexile = parsed.lexile ? {
                level: validLevels.includes(parsed.lexile.level) ? parsed.lexile.level : 'medium',
                score: typeof parsed.lexile.score === 'number' ? parsed.lexile.score : 1000,
                reasoning: parsed.lexile.reasoning || '',
            } : null;

            return NextResponse.json({
                topicVocab,
                lexile,
                count: topicVocab.length,
                success: true
            });
        } catch (error) {
            console.error('Failed to parse topic vocab JSON:', error, 'Raw text:', text);
            return NextResponse.json({ error: 'Failed to parse AI response', success: false }, { status: 500 });
        }

    } catch (error) {
        console.error('Extract topic vocab error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
