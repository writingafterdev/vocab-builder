import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, serverTimestamp } from '@/lib/firestore-rest';
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

        // Get debate session using REST API
        const debateData = await getDocument('debates', debateId);

        if (!debateData) {
            return NextResponse.json({ error: 'Debate not found' }, { status: 404 });
        }

        const debate = debateData as unknown as DebateSession;

        if (debate.status !== 'active') {
            return NextResponse.json({ error: 'Debate is not active' }, { status: 400 });
        }

        const turnNumber = (debate.turns?.length || 0) + 1;
        const maxTurns = 3;

        // Get remaining phrases
        const remainingPhrases = (debate.phrases || []).filter(p => !p.used);
        const allPhrases = debate.phrases || [];

        // Build conversation history for context
        const conversationHistory = (debate.turns || []).map(t =>
            `User: ${t.userMessage}\nOpponent: ${t.opponentResponse}`
        ).join('\n\n');

        const phraseListForPrompt = allPhrases
            .map(p => `"${p.phrase}" (status: ${p.used ? 'already used' : 'not yet used'})`)
            .join('\n- ');

        const remainingList = remainingPhrases.map(p => `"${p.phrase}"`).join(', ');

        const isFormal = debate.mode === 'written';
        const toneInstruction = isFormal
            ? "PROFESSIONAL tone. Respectful, articulate, no slang. Like a LinkedIn discussion."
            : "GEN Z INTERNET ARGUING TONE. Use slang (ngl, lowkey, fr fr, bestie, the way...). Be sassy, witty, slightly confrontational. React like someone on Twitter who REALLY disagrees. Exaggerate for humor.";

        const prompt = `Evaluate learner's debate response and counter-argue.

TONE: ${toneInstruction}
TOPIC: ${debate.topic}
PERSONA: ${debate.opponentPersona}
${conversationHistory ? `HISTORY:\n${conversationHistory}\n` : ''}
USER (Turn ${turnNumber}): "${userMessage}"

PHRASES: ${phraseListForPrompt}
REMAINING: ${remainingList || 'None'}

TASKS:
1. Evaluate each phrase: "n"=natural, "f"=forced, "m"=missing. Be flexible with tense/spelling.
2. Brief feedback (1 sentence)
3. Counter-argument (2 sentences) with TRIGGERS for remaining phrases

JSON only:
{"ev":[{"p":"phrase","s":"n/f/m","f":"feedback"}],"uf":"feedback","op":"response"}`;

        const response = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500, // Reduced from 800 - compact output format
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

        // Normalize short keys to long keys for backward compatibility
        // ev -> phraseEvaluations, uf -> userFeedback, op -> opponentResponse
        const phraseEvaluations = (parsed.ev || parsed.phraseEvaluations || []).map((e: { p?: string; phrase?: string; s?: string; status?: string; f?: string; feedback?: string }) => ({
            phrase: e.p || e.phrase || '',
            status: normalizeStatus(e.s || e.status || 'missing'),
            feedback: e.f || e.feedback || '',
        }));
        const userFeedback = parsed.uf || parsed.userFeedback || '';
        const opponentResponse = parsed.op || parsed.opponentResponse || '';

        // Helper to normalize status codes (n/f/m -> natural/forced/missing)
        function normalizeStatus(s: string): 'natural' | 'forced' | 'missing' {
            if (s === 'n' || s === 'natural') return 'natural';
            if (s === 'f' || s === 'forced') return 'forced';
            return 'missing';
        }

        // Update phrase statuses based on evaluations
        const updatedPhrases: DebatePhrase[] = allPhrases.map(p => {
            const evaluation = phraseEvaluations.find(
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
            phrasesUsedThisTurn: phraseEvaluations
                .filter((e: PhraseEvaluation) => e.status !== 'missing')
                .map((e: PhraseEvaluation) => e.phrase) || [],
            opponentResponse: opponentResponse,
            timestamp: serverTimestamp(),
        };

        // Check if debate should end
        const allPhrasesUsed = updatedPhrases.every(p => p.used);
        const isLastTurn = turnNumber >= maxTurns;
        const shouldEnd = allPhrasesUsed || isLastTurn;

        // Update using REST API
        const updateData: Record<string, unknown> = {
            phrases: updatedPhrases,
            turns: [...(debate.turns || []), newTurn],
            status: shouldEnd ? 'completed' : 'active',
        };
        if (shouldEnd) {
            updateData.completedAt = serverTimestamp();
        }

        await updateDocument('debates', debateId, updateData);

        const phrasesRemaining = updatedPhrases.filter(p => !p.used).length;

        return NextResponse.json({
            success: true,
            turnNumber,
            phraseEvaluations: phraseEvaluations,
            opponentResponse: opponentResponse,
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
