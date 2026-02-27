import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from '@/lib/api-key-rotation';
import type { SpeakingAnalysisResult } from '@/lib/speaking-feedback';

/**
 * Analyze pronunciation for a single chunk of text
 * Used in Read & Speak mode for real-time feedback
 */

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export async function POST(request: NextRequest) {
    // Parse body early so we have chunk for fallback
    let chunk = '';
    let audioBase64 = '';
    let mimeType = 'audio/webm';
    let articleId = '';
    let chunkIndex = 0;

    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        chunk = body.chunk || '';
        audioBase64 = body.audioBase64 || '';
        mimeType = body.mimeType || 'audio/webm';
        articleId = body.articleId || '';
        chunkIndex = body.chunkIndex || 0;

        if (!chunk || !audioBase64) {
            return NextResponse.json(
                { error: 'Missing chunk text or audio' },
                { status: 400 }
            );
        }

        // Retry loop for transient errors
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const apiKey = getNextApiKey();
            if (!apiKey) {
                return NextResponse.json({ error: 'No API key available' }, { status: 503 });
            }

            try {
                const ai = new GoogleGenAI({ apiKey });

                // Simplified prompt - request minimal JSON to avoid truncation
                const prompt = `Analyze this pronunciation. User was reading:
"${chunk}"

Return ONLY this JSON (no markdown):
{"overallScore":85,"transcript":"what they said","annotatedWords":[{"text":"word","status":"correct"}],"skills":{"pronunciation":{"score":85,"issues":[]},"fluency":{"score":85,"speechRate":130,"pauseCount":1,"fillers":[]},"connectedSpeech":{"score":85,"patterns":[]}},"intonation":{"words":["the","words"],"expectedPattern":[0.5,0.6],"userPattern":[0.5,0.6]},"insights":{"strength":"Good clarity","tip":"Practice more","focusArea":"rhythm"}}

Replace values based on actual analysis. Issues array format: [{"word":"the","issue":"th→d","correction":"tongue between teeth"}]`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-lite',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: audioBase64
                                    }
                                }
                            ]
                        }
                    ],
                    config: {
                        temperature: 0.1,
                        maxOutputTokens: 2000
                    }
                });

                const text = response.text || '';
                console.log('[Chunk Feedback] Raw response length:', text.length);

                // Extract JSON - be more flexible
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    console.error('[Chunk Feedback] No JSON found in response');
                    throw new Error('No JSON in response');
                }

                // Multiple repair attempts
                const parsed = parseWithRepair(jsonMatch[0]);
                if (!parsed) {
                    console.error('[Chunk Feedback] JSON parse failed after repairs');
                    // Return fallback instead of throwing
                    return NextResponse.json({
                        success: true,
                        feedback: createFallbackFeedback(chunk),
                        chunkIndex,
                        articleId,
                        wasFallback: true,
                        reason: 'parse_failed'
                    });
                }

                const feedback = normalizeFeedback(parsed, chunk);

                return NextResponse.json({
                    success: true,
                    feedback,
                    chunkIndex,
                    articleId
                });

            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const status = (error as any)?.status || (error as any)?.code;

                // Retry on 503 (overloaded) or 429 (rate limit)
                if ((status === 503 || status === 429) && attempt < MAX_RETRIES) {
                    console.log(`[Chunk Feedback] Retry ${attempt + 1}/${MAX_RETRIES} after ${status}`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
                    continue;
                }

                // For API errors, return fallback
                if (status === 503 || status === 429 || status === 500) {
                    console.log('[Chunk Feedback] API error, returning fallback');
                    return NextResponse.json({
                        success: true,
                        feedback: createFallbackFeedback(chunk),
                        chunkIndex,
                        articleId,
                        wasFallback: true,
                        reason: `api_error_${status}`
                    });
                }

                throw error;
            }
        }

        throw lastError;

    } catch (error) {
        console.error('[Chunk Feedback] Final error:', error);

        // Always return fallback with 200 - we have chunk from early parse
        return NextResponse.json({
            success: true,
            feedback: createFallbackFeedback(chunk),
            chunkIndex,
            articleId,
            wasFallback: true,
            reason: 'exception'
        });
    }
}

// Robust JSON parsing with multiple repair strategies
function parseWithRepair(jsonStr: string): any | null {
    // Attempt 1: Direct parse
    try {
        return JSON.parse(jsonStr);
    } catch (e1) {
        console.log('[Chunk Feedback] Direct parse failed, trying repairs...');
    }

    // Attempt 2: Basic fixes
    try {
        const fixed = jsonStr
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/[\x00-\x1F]/g, ' ')
            .replace(/\n/g, ' ');
        return JSON.parse(fixed);
    } catch (e2) {
        console.log('[Chunk Feedback] Basic repair failed');
    }

    // Attempt 3: Truncate at last complete property
    try {
        // Find last complete key-value pair
        let depth = 0;
        let lastGoodPos = 0;
        for (let i = 0; i < jsonStr.length; i++) {
            const c = jsonStr[i];
            if (c === '{' || c === '[') depth++;
            if (c === '}' || c === ']') depth--;
            if (depth === 1 && c === ',') lastGoodPos = i;
        }
        if (lastGoodPos > 0) {
            const truncated = jsonStr.slice(0, lastGoodPos) + '}';
            return JSON.parse(truncated);
        }
    } catch (e3) {
        console.log('[Chunk Feedback] Truncation repair failed');
    }

    // Attempt 4: Extract partial data
    try {
        const scoreMatch = jsonStr.match(/"overallScore"\s*:\s*(\d+)/);
        const transcriptMatch = jsonStr.match(/"transcript"\s*:\s*"([^"]+)"/);
        if (scoreMatch) {
            return {
                overallScore: parseInt(scoreMatch[1]),
                transcript: transcriptMatch ? transcriptMatch[1] : ''
            };
        }
    } catch (e4) {
        console.log('[Chunk Feedback] Partial extraction failed');
    }

    return null;
}

function normalizeFeedback(parsed: any, targetChunk: string): SpeakingAnalysisResult {
    const words = targetChunk.split(/\s+/).filter(w => w.length > 0);

    return {
        overallScore: Math.min(100, Math.max(0, parsed.overallScore || 70)),
        transcript: parsed.transcript || targetChunk,

        skills: {
            pronunciation: {
                score: parsed.skills?.pronunciation?.score || 70,
                issues: (parsed.skills?.pronunciation?.issues || []).slice(0, 5).map((i: any) => ({
                    word: i.word || '',
                    issue: i.issue || '',
                    correction: i.correction || ''
                }))
            },
            fluency: {
                score: parsed.skills?.fluency?.score || 70,
                speechRate: parsed.skills?.fluency?.speechRate || 120,
                pauseCount: parsed.skills?.fluency?.pauseCount || 0,
                fillers: parsed.skills?.fluency?.fillers || []
            },
            vocabulary: 100,
            grammar: { score: 100, errors: [] },
            connectedSpeech: {
                score: parsed.skills?.connectedSpeech?.score || 70,
                patterns: (parsed.skills?.connectedSpeech?.patterns || []).slice(0, 4)
            }
        },

        vocabularyFeedback: [],

        intonation: {
            words: parsed.intonation?.words || words.slice(0, 10),
            expectedPattern: parsed.intonation?.expectedPattern || words.slice(0, 10).map(() => 0.5),
            userPattern: parsed.intonation?.userPattern || []
        },

        // Use ALL words - no slicing
        annotatedWords: parsed.annotatedWords?.length > 0
            ? parsed.annotatedWords.map((w: any) => ({
                text: w.text || '',
                status: w.status || 'correct',
                annotation: w.annotation
            }))
            : words.map(w => ({ text: w, status: 'correct' as const })),

        insights: {
            strength: parsed.insights?.strength || 'Good effort!',
            tip: parsed.insights?.tip || 'Keep practicing for more fluency.',
            focusArea: parsed.insights?.focusArea || 'general pronunciation'
        }
    };
}

function createFallbackFeedback(chunk: string): SpeakingAnalysisResult {
    const words = chunk.split(/\s+/).filter(w => w.length > 0);

    return {
        overallScore: 75,
        transcript: chunk,
        skills: {
            pronunciation: {
                score: 75,
                issues: [{
                    word: '(analysis unavailable)',
                    issue: 'Could not analyze',
                    correction: 'Please try recording again for detailed feedback'
                }]
            },
            fluency: { score: 75, speechRate: 125, pauseCount: 1, fillers: [] },
            vocabulary: 100,
            grammar: { score: 100, errors: [] },
            connectedSpeech: { score: 75, patterns: [] }
        },
        vocabularyFeedback: [],
        intonation: {
            words: words.slice(0, 10),
            expectedPattern: words.slice(0, 10).map(() => 0.5),
            userPattern: []
        },
        annotatedWords: words.map(w => ({ text: w, status: 'correct' as const })),
        insights: {
            strength: 'Recording received',
            tip: 'Analysis temporarily unavailable. Try again for detailed feedback.',
            focusArea: 'general pronunciation'
        }
    };
}
