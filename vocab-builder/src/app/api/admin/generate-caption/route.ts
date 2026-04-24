import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getAdminRequestContext } from '@/lib/admin-auth';

/**
 * Generate an article caption using Gemini Flash
 * Admin-only endpoint - creates conversational Substack-style captions
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminRequestContext(request);
        if (!admin) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }
        const email = admin.userEmail;

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

        const prompt = `You are a thoughtful writer who shares articles and content on social media with deep, personal reflections. Your captions are mini-essays that connect the content to your own experiences, observations, and journey.

Generate an authentic, reflective caption (3-5 paragraphs, 150-250 words) that weaves together the article's ideas with personal stories and insights.

GUIDELINES:
- Start with a hook - Open with a personal anecdote, observation, or moment that relates to the article's theme
- Build a narrative - Tell a story about why this topic matters to you personally
- Connect to past experiences - Draw from memories, previous learnings, mistakes, or transformative moments
- Explore the "why now" - Explain why this article resonated at this particular moment
- Be vulnerable - Share genuine struggles, confusions, or revelations related to the topic
- Link past and present - Show how your thinking has evolved or how this piece confirmed/challenged your beliefs
- Make it conversational - Write like you're talking to a friend over coffee, not giving a lecture
- End with reflection - Close with what you're taking away or still wrestling with

COMMON PATTERNS TO USE:
- "I used to think... but this article helped me see..."
- "Three years ago, I experienced [x]. Reading this made me realize..."
- "I've been struggling with [topic] since [time]. This finally clicked because..."
- "This reminded me of when I..."
- "The part about [x] hit differently because..."

STYLE:
- use lowercase aesthetic throughout, no capitalization even for proper nouns or sentence beginnings
- thoughtful, introspective, honest, relatable
- not preachy or performative, like journaling in public
- DON'T USE EMDASH (--)

Article Title: "${title || 'Untitled'}"

Article Content (excerpt):
"""
${content.substring(0, 2500)}
"""

Write ONLY the caption, nothing else:`;

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GEMINI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gemini-3-flash-preview',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
                temperature: 0.85,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini generate-caption error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to generate caption: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        let caption = data.choices?.[0]?.message?.content?.trim() || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email,
                endpoint: 'admin-generate-caption',
                model: 'gemini-3-flash',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean up any quotes around the caption
        caption = caption.replace(/^["']|["']$/g, '').trim();

        return NextResponse.json({
            caption,
            success: true,
        });

    } catch (error) {
        console.error('Generate caption error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
