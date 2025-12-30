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

                const prompt = `Analyze this debate and provide brief feedback.

Topic: ${debate.topic}
Debate:
${debateHistory}

Return JSON only (no markdown):
{
    "userStrengths": "1 sentence about what the user did well",
    "userTip": "1 specific actionable tip for the user to improve",
    "overallScore": "A short encouraging phrase like 'Great debate!' or 'Strong effort!'"
}

Be encouraging and constructive. Focus on argument strength and persuasion techniques.`;

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
                    const content = data.choices?.[0]?.message?.content || '';

                    // Parse JSON response
                    try {
                        const jsonMatch = content.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            rhetoricalFeedback = JSON.stringify({
                                userStrengths: parsed.userStrengths || '',
                                userTip: parsed.userTip || '',
                                overallScore: parsed.overallScore || 'Well done!',
                            });
                        } else {
                            rhetoricalFeedback = content;
                        }
                    } catch {
                        rhetoricalFeedback = content;
                    }

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
            // Deduplicate phraseIds - multiple children may share the same root
            const usedPhraseIds = new Set<string>();
            for (const phrase of finalPhrases) {
                if (phrase.used && phrase.phraseId) {
                    usedPhraseIds.add(phrase.phraseId);
                }
            }

            // Increment practiceCount once per root phrase
            for (const phraseId of usedPhraseIds) {
                try {
                    const phraseDoc = await getDocument('savedPhrases', phraseId);
                    if (phraseDoc) {
                        const currentCount = (phraseDoc.practiceCount as number) || 0;
                        await updateDocument('savedPhrases', phraseId, {
                            practiceCount: currentCount + 1,
                        });
                    }
                } catch (error) {
                    console.error('Practice count update error:', error);
                }
            }
        } else {
            // For scheduled debates, update SRS for ALL root phrases
            const intervals = [1, 3, 7, 14, 30, 90]; // DEFAULT_LEARNING_CYCLE.intervals

            // Deduplicate phraseIds and aggregate status (best status wins: natural > forced > missing)
            const phraseStatusMap = new Map<string, { status: string; phrase: string }>();
            for (const phrase of finalPhrases) {
                if (phrase.phraseId) {
                    const existing = phraseStatusMap.get(phrase.phraseId);
                    if (!existing) {
                        phraseStatusMap.set(phrase.phraseId, { status: phrase.status || 'missing', phrase: phrase.phrase });
                    } else {
                        // Upgrade status if better: natural > forced > missing
                        const statusPriority = { natural: 3, forced: 2, missing: 1 };
                        const currentPriority = statusPriority[phrase.status as keyof typeof statusPriority] || 1;
                        const existingPriority = statusPriority[existing.status as keyof typeof statusPriority] || 1;
                        if (currentPriority > existingPriority) {
                            phraseStatusMap.set(phrase.phraseId, { status: phrase.status || 'missing', phrase: phrase.phrase });
                        }
                    }
                }
            }

            // Update SRS once per root phrase
            for (const [phraseId, { status, phrase }] of phraseStatusMap) {
                try {
                    const phraseDoc = await getDocument('savedPhrases', phraseId);
                    if (phraseDoc) {
                        const currentStep = (phraseDoc.learningStep as number) || 0;
                        let nextStep = currentStep;
                        let daysToAdd = 1;

                        if (status === 'natural') {
                            nextStep = Math.min(currentStep + 1, intervals.length - 1);
                            daysToAdd = intervals[nextStep];
                            masteryUpdates.push(phrase);
                        } else if (status === 'forced') {
                            daysToAdd = intervals[currentStep] || 1;
                        } else {
                            daysToAdd = 1;
                        }

                        const nextDate = new Date();
                        nextDate.setDate(nextDate.getDate() + daysToAdd);
                        nextDate.setHours(0, 0, 0, 0);

                        await updateDocument('savedPhrases', phraseId, {
                            learningStep: nextStep,
                            lastReviewDate: new Date(),
                            nextReviewDate: nextDate,
                            usageCount: ((phraseDoc.usageCount as number) || 0) + 1, // usageCount for scheduled reviews
                        });
                    }
                } catch (error) {
                    console.error('SRS update error for phrase:', phrase, error);
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
