import { NextRequest, NextResponse } from 'next/server';
import { addDocument, updateDocument, runQuery } from '@/lib/firestore-rest';
import { SavedPhrase } from '@/lib/db/types';
import { selectPhrasesForSession } from '@/lib/phrase-selection';

interface StartSessionRequest {
    phraseIds?: string[];  // Optional - if not provided, uses selection algorithm
    scenario?: string;
}

const MAX_LIVE_PHRASES = 15;
const MIN_LIVE_PHRASES = 5;

/**
 * Initialize a Live Session
 * 
 * Creates a session document and generates the AI system prompt
 * with target phrases for the conversation.
 * 
 * If phraseIds not provided, uses the intelligent phrase selection algorithm
 * to pick the best phrases for the session.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: StartSessionRequest = await request.json();
        const { phraseIds: providedPhraseIds, scenario } = body;

        let phrases: SavedPhrase[] = [];

        // If phraseIds provided, use those (backward compatibility)
        // Otherwise, use the selection algorithm
        if (providedPhraseIds && providedPhraseIds.length > 0) {
            // Fetch provided phrases
            const { getDocument } = await import('@/lib/firestore-rest');
            for (const id of providedPhraseIds.slice(0, MAX_LIVE_PHRASES)) {
                try {
                    const doc = await getDocument('savedPhrases', id);
                    if (doc) {
                        phrases.push(doc as unknown as SavedPhrase);
                    }
                } catch (e) {
                    console.warn(`Could not fetch phrase ${id}:`, e);
                }
            }
        } else {
            // Use selection algorithm to pick best phrases
            const allPhrases = await runQuery(
                'savedPhrases',
                [{ field: 'userId', op: 'EQUAL', value: userId }],
                200
            );

            // Filter to Step 3+ (eligible for live session)
            const eligiblePhrases = allPhrases.filter(
                (p: any) => (p.learningStep || 0) >= 3
            ) as unknown as SavedPhrase[];

            if (eligiblePhrases.length < MIN_LIVE_PHRASES) {
                return NextResponse.json({
                    error: `Need at least ${MIN_LIVE_PHRASES} Step 3+ phrases for live session`,
                    phraseCount: eligiblePhrases.length
                }, { status: 400 });
            }

            // Select phrases using the algorithm
            phrases = selectPhrasesForSession(
                eligiblePhrases,
                'live',
                MAX_LIVE_PHRASES
            );
        }

        if (phrases.length === 0) {
            return NextResponse.json(
                { error: 'No valid phrases found' },
                { status: 400 }
            );
        }

        const phraseIds = phrases.map(p => p.id);

        // Group phrases by topic for natural conversation flow
        const topicGroups = groupPhrasesByTopic(phrases);

        // Generate system prompt for Gemini Live
        const systemPrompt = generateSystemPrompt(phrases, topicGroups, scenario);

        // Create session document
        const sessionId = await addDocument('liveSessions', {
            userId,
            phraseIds,
            startedAt: new Date().toISOString(),
            status: 'active',
            scenario: scenario || 'casual_catchup',
            durationSeconds: 0,
            phrasesUsed: [],
            transcript: ''
        });

        // Mark phrases as being tested
        for (const id of phraseIds) {
            await updateDocument('savedPhrases', id, {
                liveSessionStatus: 'pending'
            });
        }

        return NextResponse.json({
            sessionId,
            systemPrompt,
            phrases: phrases.map(p => ({
                id: p.id,
                phrase: p.phrase,
                meaning: p.meaning,
                topic: p.topic
            })),
            estimatedDuration: '~2 minutes',
            instructions: `Have a natural conversation about ${scenario || 'catching up'}. Try to use the target phrases naturally.`
        });

    } catch (error) {
        console.error('Start live session error:', error);
        return NextResponse.json(
            { error: 'Failed to start live session' },
            { status: 500 }
        );
    }
}

/**
 * Group phrases by their topic for organized conversation flow
 */
function groupPhrasesByTopic(phrases: SavedPhrase[]): Map<string, SavedPhrase[]> {
    const groups = new Map<string, SavedPhrase[]>();

    for (const phrase of phrases) {
        const topic = (typeof phrase.topic === 'string' ? phrase.topic : phrase.topic?.[0]) || 'general';
        if (!groups.has(topic)) {
            groups.set(topic, []);
        }
        groups.get(topic)!.push(phrase);
    }

    return groups;
}

/**
 * Generate the system prompt for Gemini Live AI
 */
function generateSystemPrompt(
    phrases: SavedPhrase[],
    topicGroups: Map<string, SavedPhrase[]>,
    scenario?: string
): string {
    const phraseList = phrases.map(p => `- "${p.phrase}" (${p.meaning})`).join('\n');
    const topics = Array.from(topicGroups.keys()).join(', ');

    return `You are having a friendly casual conversation with a language learner. Your role is to be a natural conversation partner, testing their ability to use certain phrases in context.

SCENARIO: ${scenario || 'You are catching up with an old friend over a video call.'}

YOUR PERSONALITY:
- Warm, encouraging, and patient
- Speak naturally, not like a teacher
- Ask follow-up questions to keep the conversation flowing
- Acknowledge when the user uses a target phrase well

TARGET PHRASES TO TEST:
${phraseList}

CONVERSATION TOPICS TO COVER: ${topics}

YOUR STRATEGY:
1. Start with a warm greeting and ask an open question
2. Use some target phrases yourself (tests their comprehension)
3. Ask questions designed to elicit the target phrases
4. If they struggle, subtly hint: "How would you describe that situation?"
5. Natural transitions: "That reminds me..." or "Speaking of..."
6. Keep it to ~2 minutes total

IMPORTANT RULES:
- NEVER explicitly say "use this phrase" or "the target phrases are..."
- Be conversational, not robotic
- If user uses a phrase naturally, briefly acknowledge: "Oh definitely!" or "I know what you mean"
- End naturally when time is running low

Begin the conversation now with a friendly greeting.`;
}
