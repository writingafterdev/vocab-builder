import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { runQuery } from '@/lib/firestore-rest';
import { getNextApiKey } from '@/lib/api-key-rotation';

/**
 * Generate an Immersive Mode session
 * Mode: 'reading' or 'listening'
 * Uses DUE phrases at Step 3+
 */
export async function POST(request: NextRequest) {
    try {
        // Auth
        const authHeader = request.headers.get('authorization');
        const userIdHeader = request.headers.get('x-user-id');

        let userId: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = await verifyIdToken(token);
                if (decoded) {
                    userId = decoded.uid;
                }
            } catch {
                console.log('[Immersive Generate] Token verification failed, using header');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const mode: 'reading' | 'listening' = body.mode || 'reading';

        // Fetch DUE phrases at Step 3+
        const allPhrases = await runQuery(
            'savedPhrases',
            [{ field: 'userId', op: 'EQUAL', value: userId }],
            200
        );

        const now = new Date();
        const eligiblePhrases = allPhrases.filter((p: any) => {
            const step = p.learningStep || 0;
            const nextReview = p.nextReviewDate ? new Date(p.nextReviewDate) : now;
            const isDue = nextReview <= now;
            return step >= 3 && isDue;
        });

        if (eligiblePhrases.length < 3) {
            return NextResponse.json(
                { error: 'Not enough eligible phrases' },
                { status: 400 }
            );
        }

        // Select up to 5 phrases for the session
        const sessionPhrases = eligiblePhrases.slice(0, 5);

        // Build prompt for content generation
        const phraseList = sessionPhrases.map((p: any) =>
            `- "${p.phrase}" (${p.meaning})`
        ).join('\n');

        const prompt = `Generate a short ${mode === 'listening' ? 'dialogue' : 'article'} that naturally incorporates these phrases:

${phraseList}

Requirements:
- 150-250 words
- Natural, conversational tone
- Each phrase should appear in context at least once
- ${mode === 'listening' ? 'Format as a dialogue between 2 people' : 'Format as a cohesive article/story'}

Then create 4 comprehension questions:
1. Main idea question
2. Context question about one of the phrases
3. Inference question
4. Detail question

Return JSON:
{
    "title": "...",
    "content": "...",
    "format": "${mode === 'listening' ? 'dialogue' : 'article'}",
    "questions": [
        { "question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": "A", "explanation": "..." }
    ],
    "phrases": [{ "phrase": "...", "meaning": "...", "id": "..." }]
}`;

        const apiKey = getNextApiKey();
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: 'You are an expert English language teacher creating immersive reading/listening content.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No content generated');
        }

        const session = JSON.parse(content);

        // Add phrase IDs from our db
        session.phrases = sessionPhrases.map((p: any) => ({
            id: p.id,
            phrase: p.phrase,
            meaning: p.meaning,
            learningStep: p.learningStep,
        }));

        session.mode = mode;
        session.userId = userId;
        session.createdAt = new Date().toISOString();

        return NextResponse.json(session);
    } catch (error) {
        console.error('[Immersive Generate] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate session' },
            { status: 500 }
        );
    }
}
