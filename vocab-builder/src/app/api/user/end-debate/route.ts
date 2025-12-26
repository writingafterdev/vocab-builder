import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, serverTimestamp } from '@/lib/firestore-rest';
import type { DebateSession } from '@/lib/db/types';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * End a debate session and generate summary with mastery updates
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface AssistedPhrase {
    vietnamese: string;
    english: string;
}

interface EndDebateRequest {
    debateId: string;
    assistedPhrases?: AssistedPhrase[];
}

export async function POST(request: NextRequest) {
    try {
        const userEmail = request.headers.get('x-user-email');
        if (!userEmail) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: EndDebateRequest = await request.json();
        const { debateId, assistedPhrases } = body;

        if (!debateId) {
            return NextResponse.json({ error: 'Missing debateId' }, { status: 400 });
        }

        // Get debate session using REST API
        const debateData = await getDocument('debates', debateId);

        if (!debateData) {
            return NextResponse.json({ error: 'Debate not found' }, { status: 404 });
        }

        const debate = debateData as unknown as DebateSession;

        // Mark any remaining phrases as 'missing'
        const finalPhrases = (debate.phrases || []).map(p => ({
            ...p,
            status: p.used ? p.status : 'missing',
            feedback: p.used ? p.feedback : 'Not used in this debate.',
        }));

        // Calculate summary
        const natural = finalPhrases.filter(p => p.status === 'natural').length;
        const forced = finalPhrases.filter(p => p.status === 'forced').length;
        const missing = finalPhrases.filter(p => p.status === 'missing').length;

        // Generate rhetorical feedback
        let rhetoricalFeedback = '';
        if (DEEPSEEK_API_KEY && (debate.turns?.length || 0) > 0) {
            try {
                const debateHistory = (debate.turns || [])
                    .map(t => `User: ${t.userMessage}\nOpponent: ${t.opponentResponse}`)
                    .join('\n\n');

                const prompt = `Analyze this debate and provide brief rhetorical feedback (2-3 sentences max).

Topic: ${debate.topic}
Debate:
${debateHistory}

Focus on:
- Argument strength
- Persuasion techniques used
- One tip for improvement

Be encouraging and constructive.`;

                const response = await fetch(DEEPSEEK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 200,
                        temperature: 0.7,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    rhetoricalFeedback = data.choices?.[0]?.message?.content || '';

                    // Log token usage
                    if (data.usage) {
                        logTokenUsage({
                            userId: debate.userId,
                            userEmail,
                            endpoint: 'end-debate',
                            model: 'deepseek-chat',
                            promptTokens: data.usage.prompt_tokens || 0,
                            completionTokens: data.usage.completion_tokens || 0,
                            totalTokens: data.usage.total_tokens || 0,
                        });
                    }
                }
            } catch (error) {
                console.error('Rhetoric feedback error:', error);
            }
        }

        // Update phrase practice counts for on-demand debates using REST API
        const masteryUpdates: string[] = [];
        if (!debate.isScheduled) {
            for (const phrase of finalPhrases) {
                if (phrase.used && phrase.phraseId) {
                    try {
                        // Get current practice count
                        const phraseDoc = await getDocument('savedPhrases', phrase.phraseId);
                        if (phraseDoc) {
                            const currentCount = (phraseDoc.practiceCount as number) || 0;
                            await updateDocument('savedPhrases', phrase.phraseId, {
                                practiceCount: currentCount + 1,
                            });
                        }
                    } catch (error) {
                        console.error('Practice count update error:', error);
                    }
                }
            }
        } else {
            // For scheduled debates, just note that we'd update mastery
            // Full SRS update would need more REST API work
            for (const phrase of finalPhrases) {
                if (phrase.status === 'natural') {
                    masteryUpdates.push(phrase.phrase);
                }
            }
        }

        // Mark debate as completed
        await updateDocument('debates', debateId, {
            phrases: finalPhrases,
            assistedPhrases: assistedPhrases || [],
            status: 'completed',
            completedAt: serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            summary: {
                natural,
                forced,
                missing,
                totalTurns: debate.turns?.length || 0,
                totalPhrases: finalPhrases.length,
            },
            phraseResults: finalPhrases.map(p => ({
                phrase: p.phrase,
                status: p.status,
                feedback: p.feedback,
                turnUsedIn: p.turnUsedIn,
            })),
            rhetoricalFeedback,
            masteryUpdates,
        });

    } catch (error) {
        console.error('End debate error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
