import { NextRequest, NextResponse } from 'next/server';
import { addDocument, serverTimestamp } from '@/lib/firestore-rest';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Start a new Guided Debate session
 * Generates background knowledge, opponent position, and initializes debate
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface StartDebateRequest {
    userId: string;
    phrases: Array<{
        phraseId: string;
        phrase: string;
        meaning: string;
    }>;
    topicAngle?: string; // workplace, family, education, etc.
    isScheduled?: boolean; // true if from /practice (SRS), false if from /vocab (on-demand)
}

const TOPIC_ANGLES = [
    'workplace',
    'education',
    'family',
    'technology',
    'society',
    'personal growth'
];

const PERSONAS = [
    { name: 'Sam', style: 'Thoughtful - considers multiple perspectives calmly' },
    { name: 'Riley', style: 'Curious - asks probing questions to deepen discussion' },
    { name: 'Taylor', style: 'Constructive - builds on ideas while offering alternatives' },
];

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
        }

        const body: StartDebateRequest = await request.json();
        const { userId, phrases, topicAngle, isScheduled = false } = body;

        if (!userId || !phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Select random angle if not provided
        const angle = topicAngle || TOPIC_ANGLES[Math.floor(Math.random() * TOPIC_ANGLES.length)];

        // Select random persona
        const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];

        const phraseList = phrases.map(p => `"${p.phrase}" (${p.meaning})`).join('\n- ');

        const prompt = `You are creating a Reddit/Twitter style argument scenario for English practice.

Target phrases the learner must use in the argument:
- ${phraseList}

Topic angle: ${angle}

Generate:
1. A HOT TAKE TOPIC related to ${angle} - something people argue about on Twitter/Reddit (controversial opinions, unpopular takes, "am I the asshole" type situations)

2. CONTEXT (2-3 short paragraphs) that:
   - Reads like a Reddit post or Twitter thread explaining the situation
   - Is REAL and relatable (relationship drama, workplace BS, social media debates, etc.)
   - WEAVES IN ALL TARGET PHRASES naturally
   - Has that authentic internet storytelling vibe ("so basically...", "here's the thing...", "I can't be the only one who thinks...")

3. An OPPONENT'S HOT TAKE (2-3 sentences) that:
   - Sounds like a real Reddit/Twitter reply that's picking a fight
   - Is provocative, maybe a bit snarky, definitely opinionated
   - PUSHES THE LEARNER to defend their position using the target phrases
   - Has internet argument energy ("That's a weird take", "You're missing the point", "This is exactly why...", "Nah, here's the thing...")

VIBE CHECK:
- Sound like a real person on the internet, not a debate coach
- Use casual language, internet speak is fine (ngl, tbh, lowkey, etc.)
- Be slightly provocative - real arguments have tension
- NEVER use em dashes (— or --)
- Can be sarcastic, can have attitude, can be a little spicy

Return JSON only:
{
    "topic": "Punchy hot take title like a Reddit post or tweet",
    "background": "Context that reads like a real Reddit post/Twitter thread with ALL phrases woven in...",
    "opponentPosition": "A spicy, opinionated reply that picks a fight and makes the learner want to clap back using the target phrases..."
}`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1200,
                temperature: 0.8,
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to generate debate' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: userEmail,
                endpoint: 'start-debate',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        // Clean up markdown code blocks
        text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

        // Try to extract JSON object if wrapped in other text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            text = jsonMatch[0];
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.error('JSON parse error. Raw text:', text.substring(0, 500));
            // Fallback: create a basic debate structure
            parsed = {
                topic: 'Open Discussion',
                background: `Let's discuss these phrases: ${phrases.map(p => p.phrase).join(', ')}`,
                opponentPosition: 'I believe there are multiple perspectives to consider here. What are your thoughts?'
            };
        }

        // Create debate session using REST API
        const debateData = {
            userId,
            topic: parsed.topic || 'Open Discussion',
            topicAngle: angle,
            backgroundContent: parsed.background || '',
            phrases: phrases.map(p => ({
                phrase: p.phrase,
                phraseId: p.phraseId,
                meaning: p.meaning,
                used: false,
                turnUsedIn: null,
                status: 'pending',
                feedback: '',
            })),
            opponentPersona: persona.name,
            opponentPosition: parsed.opponentPosition || '',
            turns: [],
            status: 'active',
            isScheduled,
            createdAt: serverTimestamp(),
        };

        const docId = await addDocument('debates', debateData);

        return NextResponse.json({
            success: true,
            debateId: docId,
            topic: debateData.topic,
            topicAngle: angle,
            background: debateData.backgroundContent,
            phrases: debateData.phrases,
            opponentPersona: persona.name,
            opponentStyle: persona.style,
            opponentPosition: debateData.opponentPosition,
        });

    } catch (error) {
        console.error('Start debate error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
