import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { updateDocument } from '@/lib/appwrite/database';
import { getAdminRequestContext } from '@/lib/admin-auth';

/**
 * Generate reading sections for an article using Gemini
 * Divides article into logical sections for swipe reading mode
 * Admin-only endpoint
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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

        const { postId, title, content } = await request.json();

        if (!postId || !content || typeof content !== 'string') {
            return NextResponse.json(
                { error: 'postId and content are required' },
                { status: 400 }
            );
        }

        const prompt = `You are a reading experience designer. Your task is to divide an article into logical reading sections for a card-based swipe reading interface.

ARTICLE TITLE: "${title || 'Untitled'}"
ARTICLE CONTENT:
"""
${content.substring(0, 50000)}
"""

TASK:
Divide this article into 3-8 logical sections based on topic shifts, narrative flow, or argument progression. Each section should:
- Be self-contained enough to read on a single card (~100-250 words)
- End at natural breakpoints (not mid-sentence or mid-thought)
- Have an optional title if the section covers a distinct subtopic
- List any notable vocabulary phrases or expressions worth highlighting

RULES:
- Do NOT split mid-paragraph unless the paragraph is very long (300+ words)
- Prefer splitting at paragraph boundaries
- The first section should include the article's opening/introduction
- The last section should include the conclusion
- Maintain the original HTML formatting within each section
- Keep sections roughly balanced in length (avoid one 50-word section and one 400-word section)
- For vocabPhrases: extract 2-5 interesting phrases/expressions per section that learners should notice

ALSO: Extract a one-line subtitle/caption for the article (a compelling summary or thesis statement).

Return JSON:
{
  "subtitle": "A one-line subtitle capturing the article's thesis",
  "sections": [
    {
      "title": "Optional section title or null",
      "content": "<p>HTML content for this section...</p>",
      "vocabPhrases": ["phrase one", "phrase two"]
    }
  ]
}`;

        const response = await fetch(`${GEMINI_BASE_URL}/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    maxOutputTokens: 8192,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini generate-sections error:', response.status, errorText);
            return NextResponse.json(
                { error: `Failed to generate sections: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Log token usage
        if (data.usageMetadata) {
            logTokenUsage({
                userId: 'admin',
                userEmail: email,
                endpoint: 'admin-generate-sections',
                model: 'gemini-3-flash-preview',
                promptTokens: data.usageMetadata.promptTokenCount || 0,
                completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata.totalTokenCount || 0,
            });
        }

        try {
            const parsed = JSON.parse(text);
            const subtitle = parsed.subtitle || '';
            const rawSections = parsed.sections || [];

            // Validate and structure sections
            const sections = rawSections.map((s: { title?: string; content: string; vocabPhrases?: string[] }, i: number) => ({
                id: `section-${i}`,
                title: s.title || undefined,
                content: s.content || '',
                vocabPhrases: Array.isArray(s.vocabPhrases) ? s.vocabPhrases : [],
            }));

            if (sections.length === 0) {
                return NextResponse.json(
                    { error: 'AI returned no sections' },
                    { status: 500 }
                );
            }

            // Save to Firestore
            await updateDocument('posts', postId, {
                subtitle,
                sections,
            });

            return NextResponse.json({
                success: true,
                subtitle,
                sections,
                sectionCount: sections.length,
            });
        } catch (error) {
            console.error('Failed to parse sections JSON:', error, 'Raw text:', text);
            return NextResponse.json(
                { error: 'Failed to parse AI response' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Generate sections error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
