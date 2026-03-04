import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { runQuery, getDocument } from '@/lib/firestore-rest';

const XAI_API_KEY = process.env.XAI_API_KEY;

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

        // Try pre-generated exercises first
        const today = new Date().toISOString().split('T')[0];
        const preGenDoc = await getDocument('preGeneratedExercises', `${today}_${userId}`);
        if (preGenDoc && (preGenDoc as any).immersiveSession) {
            const immersive = (preGenDoc as any).immersiveSession;
            const preGenContent = mode === 'listening' ? immersive.listening : immersive.reading;
            if (preGenContent) {
                console.log(`[Immersive Generate] Using pre-generated ${mode} content`);
                return NextResponse.json({
                    ...preGenContent,
                    mode,
                    userId,
                    phrases: eligiblePhrases.slice(0, 5).map((p: any) => ({
                        id: p.id,
                        phrase: p.phrase,
                        meaning: p.meaning,
                        learningStep: p.learningStep,
                    })),
                    createdAt: new Date().toISOString(),
                });
            }
        }

        // Select up to 5 phrases for the session
        const finalPhrases = eligiblePhrases.slice(0, 5);

        // Build prompt for content generation
        const phraseList = finalPhrases.map((p: any) =>
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

        if (!XAI_API_KEY) {
            throw new Error('XAI_API_KEY not configured');
        }

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
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
        session.phrases = finalPhrases.map((p: any) => ({
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
