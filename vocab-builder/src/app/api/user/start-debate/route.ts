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
    mode?: 'spoken' | 'written' | 'neutral'; // Debate style: casual or formal
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

// Casual/Spoken mode prompt (GenZ Reddit/Twitter arguing style)
function generateCasualPrompt(phraseList: string, angle: string): string {
    return `You're generating a spicy Reddit/Twitter debate for English practice. Make it feel like two chronically online GenZ people arguing.

Phrases to use: ${phraseList}
Topic: ${angle}

STYLE RULES:
- Use internet slang: "ngl", "lowkey", "fr fr", "the way...", "not me thinking...", "I-"
- Hot takes, unpopular opinions, AITA vibes
- Sarcastic, witty, slightly confrontational but fun
- Gen Z humor: exaggeration, irony, calling things out
- Include TRIGGERS (synonyms/related words) for each phrase

Generate:
1. TOPIC: Spicy hot take that would start arguments on Twitter (use "Unpopular Opinion:", "AITA for...", "HOT TAKE:", etc.)
2. CONTEXT: 2-3 sentences setting up the drama with triggers. Make it relatable Gen Z stuff.
3. OPPONENT: 2 sentences sassy disagreement with triggers. Like they REALLY disagree.

Return compact JSON:
{"t":"topic","bg":"context...","op":"opponent reply..."}`;
}

// Written/Neutral mode prompt
function generateFormalPrompt(phraseList: string, angle: string): string {
    return `Create a short professional discussion for English writing practice.

Phrases to use: ${phraseList}
Topic: ${angle}

Tone: Professional blog/email style. No slang. Contractions OK.
Include TRIGGERS (synonyms) for each phrase.

Generate:
1. TOPIC: Clear, relatable topic
2. CONTEXT: 2-3 sentences professional setup with triggers
3. OPPONENT: 2 sentences respectful disagreement with triggers

Return compact JSON:
{"t":"topic","bg":"context...","op":"counterargument..."}`;
}

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
        const { userId, phrases, topicAngle, isScheduled = false, mode = 'spoken' } = body;



        if (!userId || !phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Select random angle if not provided
        const angle = topicAngle || TOPIC_ANGLES[Math.floor(Math.random() * TOPIC_ANGLES.length)];

        // Select random persona
        const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];

        const phraseList = phrases.map(p => `"${p.phrase}" (${p.meaning})`).join('\n- ');

        // Mode-specific prompt generation
        const isWrittenMode = mode === 'written';



        const prompt = isWrittenMode
            ? generateFormalPrompt(phraseList, angle)
            : generateCasualPrompt(phraseList, angle);



        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 400, // Reduced from 1200 - compact output format
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
        // Support both short keys (t, bg, op) and long keys for backward compatibility
        const debateData = {
            userId,
            topic: parsed.t || parsed.topic || 'Open Discussion',
            topicAngle: angle,
            backgroundContent: parsed.bg || parsed.background || '',
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
            opponentPosition: parsed.op || parsed.opponentPosition || '',
            mode: mode, // Save mode to persist tone across turns
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
