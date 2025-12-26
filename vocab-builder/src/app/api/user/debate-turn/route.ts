import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DebateSession, DebatePhrase, DebateTurn } from '@/lib/db/types';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Process a debate turn - evaluate user's message and generate opponent response
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface DebateTurnRequest {
    debateId: string;
    userMessage: string;
}

interface PhraseEvaluation {
    phrase: string;
    status: 'natural' | 'forced' | 'missing';
    feedback: string;
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const body: DebateTurnRequest = await request.json();
        const { debateId, userMessage } = body;

        if (!debateId || !userMessage) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!db) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        // Get debate session from Firestore
        const debateRef = doc(db, 'debates', debateId);
        const debateSnap = await getDoc(debateRef);

        if (!debateSnap.exists()) {
            return NextResponse.json({ error: 'Debate not found' }, { status: 404 });
        }

        const debate = debateSnap.data() as DebateSession;

        if (debate.status !== 'active') {
            return NextResponse.json({ error: 'Debate is not active' }, { status: 400 });
        }

        const turnNumber = debate.turns.length + 1;
        const maxTurns = 3;

        // Get remaining phrases
        const remainingPhrases = debate.phrases.filter(p => !p.used);
        const allPhrases = debate.phrases;

        // Build conversation history for context
        const conversationHistory = debate.turns.map(t =>
            `User: ${t.userMessage}\nOpponent: ${t.opponentResponse}`
        ).join('\n\n');

        const phraseListForPrompt = allPhrases
            .map(p => `"${p.phrase}" (status: ${p.used ? 'already used' : 'not yet used'})`)
            .join('\n- ');

        const remainingList = remainingPhrases.map(p => `"${p.phrase}"`).join(', ');

        const prompt = `You are evaluating a language learner's debate response and generating a counter-argument.

DEBATE CONTEXT:
Topic: ${debate.topic}
Background: ${debate.backgroundContent}
Opponent persona: ${debate.opponentPersona}
Opponent's opening position: ${debate.opponentPosition}

${conversationHistory ? `PREVIOUS EXCHANGES:\n${conversationHistory}\n` : ''}

USER'S LATEST MESSAGE (Turn ${turnNumber}):
"${userMessage}"

PHRASES TO TRACK:
- ${phraseListForPrompt}

REMAINING PHRASES (steer conversation toward these): ${remainingList || 'None'}

TASKS:
1. For each phrase, determine if it was used in this message:
   - "natural": Used correctly and naturally
   - "forced": Present but awkward or grammatically wrong
   - "missing": Not used in this message (leave feedback empty if already used before)

   **IMPORTANT - BE FLEXIBLE when matching phrases:**
   - Accept British/American spelling variations (learnt/learned, colour/color, realise/realize)
   - Accept minor tense variations if the core phrase is present (e.g., "I learn this the hard way" counts for "I learned this the hard way")
   - Accept minor word form changes (e.g., "learning" for "learn")
   - **CRITICAL: Accept phrases embedded in longer expressions** (e.g., "have a nuanced view" counts for "nuanced view", "it pops into my head" counts for "pops into")
   - If the CORE WORDS of the phrase appear together in the message, even with extra words around them, it COUNTS as used
   - Focus on MEANING, not exact character-by-character match

2. Generate an opponent counter-response that:
   - STRATEGICALLY positions the learner so they'll NEED to use the remaining phrases to respond
   - Challenges their argument in a way that the remaining phrases are the natural way to respond
   - Is casual, conversational, Gen Z-friendly (not academic)
   - Is 2-3 sentences max
   - Stays in character as ${debate.opponentPersona}
   - NEVER uses em dashes (— or --)

Return JSON only:
{
    "phraseEvaluations": [
        {"phrase": "...", "status": "natural", "feedback": "Good use!"},
        {"phrase": "...", "status": "forced", "feedback": "This sounds awkward because..."}
    ],
    "opponentResponse": "A strategic response that FORCES the learner into a corner where using the remaining phrases is the most natural way to respond..."
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
                max_tokens: 800,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            console.error('API error:', await response.text());
            return NextResponse.json({ error: 'Failed to process turn' }, { status: 500 });
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId: debate.userId,
                userEmail,
                endpoint: 'debate-turn',
                model: 'deepseek-chat',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            console.error('JSON parse error:', text);
            parsed = {
                phraseEvaluations: [],
                opponentResponse: "That's an interesting point. Could you elaborate further?"
            };
        }

        // Update phrase statuses based on evaluations
        const updatedPhrases: DebatePhrase[] = debate.phrases.map(p => {
            const evaluation = parsed.phraseEvaluations?.find(
                (e: PhraseEvaluation) => e.phrase.toLowerCase() === p.phrase.toLowerCase()
            );

            if (evaluation && evaluation.status !== 'missing' && !p.used) {
                return {
                    ...p,
                    used: true,
                    turnUsedIn: turnNumber,
                    status: evaluation.status,
                    feedback: evaluation.feedback || '',
                };
            }
            return p;
        });

        // Create new turn
        const newTurn: DebateTurn = {
            turnNumber,
            userMessage,
            phrasesUsedThisTurn: parsed.phraseEvaluations
                ?.filter((e: PhraseEvaluation) => e.status !== 'missing')
                ?.map((e: PhraseEvaluation) => e.phrase) || [],
            opponentResponse: parsed.opponentResponse || '',
            timestamp: Timestamp.now(),
        };

        // Check if debate should end
        const allPhrasesUsed = updatedPhrases.every(p => p.used);
        const isLastTurn = turnNumber >= maxTurns;
        const shouldEnd = allPhrasesUsed || isLastTurn;

        // Update Firestore
        await updateDoc(debateRef, {
            phrases: updatedPhrases,
            turns: [...debate.turns, newTurn],
            status: shouldEnd ? 'completed' : 'active',
            ...(shouldEnd && { completedAt: Timestamp.now() }),
        });

        const phrasesRemaining = updatedPhrases.filter(p => !p.used).length;

        return NextResponse.json({
            success: true,
            turnNumber,
            phraseEvaluations: parsed.phraseEvaluations || [],
            opponentResponse: parsed.opponentResponse || '',
            phrasesRemaining,
            phrasesUsedThisTurn: newTurn.phrasesUsedThisTurn,
            canContinue: !shouldEnd,
            debateEnded: shouldEnd,
            endReason: shouldEnd ? (allPhrasesUsed ? 'all_phrases_used' : 'max_turns_reached') : null,
        });

    } catch (error) {
        console.error('Debate turn error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
