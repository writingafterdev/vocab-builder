/**
 * POST /api/daily-drill/generate
 * Generate a drill exercise based on user's weaknesses
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { pickDrillWeaknesses, WeaknessEntry } from '@/lib/db/user-weaknesses';
import { setDocument } from '@/lib/firestore-rest';
import { Timestamp } from 'firebase/firestore';

const XAI_API_KEY = process.env.XAI_API_KEY;

export interface DrillExercise {
    id: string;
    type: 'pronunciation' | 'grammar_fix' | 'register_choice' | 'nuance_match' | 'collocation_fill';
    weaknessId: string;
    weaknessCategory: string;
    instruction: string;
    prompt: string;
    options?: string[];
    correctAnswer?: string;
    explanation: string;
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyIdToken(token);
        if (!decodedToken) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        const userId = decodedToken.uid;

        const body = await request.json();
        const count = body.count || 2;

        // Pick random weaknesses
        const weaknesses = await pickDrillWeaknesses(userId, count);

        if (weaknesses.length === 0) {
            return NextResponse.json({
                drills: [],
                message: 'No weaknesses to practice! Great job!'
            });
        }

        // Generate drills for each weakness
        const drills: DrillExercise[] = [];

        for (const weakness of weaknesses) {
            const drill = await generateDrillForWeakness(weakness);
            drills.push(drill);
        }

        // Save drill session
        const sessionId = `${userId}_drill_${Date.now()}`;
        await setDocument('drillSessions', sessionId, {
            userId,
            drills,
            createdAt: Timestamp.now(),
            completed: false
        });

        return NextResponse.json({
            sessionId,
            drills
        });

    } catch (error) {
        console.error('[Daily Drill Generate] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate drill' },
            { status: 500 }
        );
    }
}

async function generateDrillForWeakness(weakness: WeaknessEntry): Promise<DrillExercise> {
    const drillType = getDrillType(weakness.category);

    // For simple cases, generate without AI
    if (drillType === 'grammar_fix' && weakness.examples.length > 0) {
        return {
            id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'grammar_fix',
            weaknessId: weakness.id,
            weaknessCategory: weakness.category,
            instruction: 'Fix the grammar error in this sentence:',
            prompt: weakness.examples[0],
            correctAnswer: weakness.correction,
            explanation: weakness.explanation
        };
    }

    if (drillType === 'pronunciation') {
        return generatePronunciationDrill(weakness);
    }

    // For complex cases, use AI
    return generateAIDrill(weakness, drillType);
}

function getDrillType(category: string): DrillExercise['type'] {
    switch (category) {
        case 'pronunciation':
        case 'connected_speech':
            return 'pronunciation';
        case 'grammar':
            return 'grammar_fix';
        case 'register':
            return 'register_choice';
        case 'nuance':
        case 'pragmatics':
            return 'nuance_match';
        case 'collocation':
            return 'collocation_fill';
        default:
            return 'grammar_fix';
    }
}

function generatePronunciationDrill(weakness: WeaknessEntry): DrillExercise {
    // Common pronunciation practice sentences
    const sentences: Record<string, string[]> = {
        'th_sound': [
            'Think through these thoughts thoroughly.',
            'The weather is better than I thought.',
            'They threw three things at the theater.'
        ],
        'connected_linking': [
            'Pick it up and put it away.',
            'Turn off the light and go to bed.',
            'Look at the stars in the sky.'
        ],
        'connected_elision': [
            'Last night was the best time ever.',
            'Next week could be interesting.',
            'Most people probably agree.'
        ]
    };

    const specific = weakness.specific.toLowerCase();
    const matchedSentences = sentences[specific] || sentences['th_sound'];
    const sentence = matchedSentences[Math.floor(Math.random() * matchedSentences.length)];

    return {
        id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'pronunciation',
        weaknessId: weakness.id,
        weaknessCategory: weakness.category,
        instruction: 'Say this sentence out loud, focusing on the highlighted sounds:',
        prompt: sentence,
        explanation: weakness.explanation
    };
}

async function generateAIDrill(
    weakness: WeaknessEntry,
    type: DrillExercise['type']
): Promise<DrillExercise> {
    if (!XAI_API_KEY) {
        return createFallbackDrill(weakness, type);
    }

    try {
        const prompt = `Generate a quick English practice exercise for this weakness:

Category: ${weakness.category}
Issue: ${weakness.specific}
Example error: "${weakness.examples[0]}"
Correction: "${weakness.correction}"
Explanation: ${weakness.explanation}

Exercise type: ${type}

For ${type}, generate:
${type === 'register_choice' ? '- A scenario and 3 response options (1 correct, 2 wrong register)' : ''}
${type === 'nuance_match' ? '- A situation and 3 phrase options (1 best fit, 2 with wrong nuance)' : ''}
${type === 'collocation_fill' ? '- A sentence with a blank and 3 word options (1 correct collocation)' : ''}

Respond in JSON:
{
  "instruction": "brief instruction",
  "prompt": "the main question or sentence",
  "options": ["option1", "option2", "option3"],
  "correctAnswer": "the correct option",
  "explanation": "why this is correct"
}`;

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [
                    { role: 'system', content: 'You are an expert English teacher. Return valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(text);

        return {
            id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type,
            weaknessId: weakness.id,
            weaknessCategory: weakness.category,
            instruction: parsed.instruction,
            prompt: parsed.prompt,
            options: parsed.options,
            correctAnswer: parsed.correctAnswer,
            explanation: parsed.explanation
        };
    } catch (error) {
        console.error('[Daily Drill] AI generation failed:', error);
    }

    return createFallbackDrill(weakness, type);
}

function createFallbackDrill(
    weakness: WeaknessEntry,
    type: DrillExercise['type']
): DrillExercise {
    return {
        id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        weaknessId: weakness.id,
        weaknessCategory: weakness.category,
        instruction: 'Review this correction:',
        prompt: `"${weakness.examples[0]}" should be "${weakness.correction}"`,
        explanation: weakness.explanation
    };
}
