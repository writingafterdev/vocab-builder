import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { getNextApiKey } from '@/lib/api-key-rotation';
import { Timestamp } from 'firebase/firestore';
import {
    TaskResponse,
    PlacementResult,
    buildAnalysisPrompt,
    calculateLevelFromScores,
    PLACEMENT_TASKS
} from '@/lib/placement-test';
import {
    saveUserProficiency,
    getLevelLabel,
    getLabelDisplayName,
    getUserProficiency
} from '@/lib/db/user-proficiency';

/**
 * POST: Submit all task recordings for proficiency analysis
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate user
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
                console.log('[Placement Test] Token verification failed');
            }
        }

        if (!userId && userIdHeader) {
            userId = userIdHeader;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request
        const body = await request.json();
        const { responses } = body as { responses: TaskResponse[] };

        if (!responses || responses.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 task responses required' },
                { status: 400 }
            );
        }

        // Get API key
        const apiKey = getNextApiKey();
        if (!apiKey) {
            return NextResponse.json(
                { error: 'AI service unavailable' },
                { status: 503 }
            );
        }

        // Build Gemini request with all audio samples
        const ai = new GoogleGenAI({ apiKey });

        const parts: any[] = [
            { text: buildAnalysisPrompt(responses.length) }
        ];

        // Add each audio recording
        for (const response of responses) {
            const task = PLACEMENT_TASKS.find(t => t.id === response.taskId);
            parts.push({
                text: `\n\n--- ${task?.title || response.taskId} ---`
            });
            parts.push({
                inlineData: {
                    mimeType: response.mimeType,
                    data: response.audioBase64
                }
            });
        }

        // Call Gemini for analysis
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite-preview-06-17',
            contents: [{ role: 'user', parts }],
            config: {
                temperature: 0.3,
                maxOutputTokens: 1000
            }
        });

        const text = aiResponse.text || '';

        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[Placement Test] No valid JSON in response:', text);
            return NextResponse.json(
                { error: 'Analysis failed - please try again' },
                { status: 500 }
            );
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Calculate final level
        const pronunciation = Math.min(100, Math.max(0, parsed.pronunciation || 50));
        const vocabulary = Math.min(100, Math.max(0, parsed.vocabulary || 50));
        const fluency = Math.min(100, Math.max(0, parsed.fluency || 50));
        const complexity = Math.min(100, Math.max(0, parsed.complexity || 50));

        const lexileLevel = calculateLevelFromScores(
            pronunciation, vocabulary, fluency, complexity
        );

        const proficiencyLabel = getLevelLabel(lexileLevel);
        const now = Timestamp.now();

        // Get existing proficiency for history
        const existing = await getUserProficiency(userId);
        const history = existing?.levelHistory || [];

        // Save to Firestore
        await saveUserProficiency(userId, {
            lexileLevel,
            proficiencyLabel,
            pronunciationScore: pronunciation,
            vocabularyScore: vocabulary,
            fluencyScore: fluency,
            complexityScore: complexity,
            lastTestDate: now,
            testCount: (existing?.testCount || 0) + 1,
            levelHistory: [
                ...history,
                { date: now, level: lexileLevel, source: 'placement_test' }
            ]
        });

        // Build result
        const result: PlacementResult = {
            pronunciation,
            vocabulary,
            fluency,
            complexity,
            lexileLevel,
            proficiencyLabel: getLabelDisplayName(proficiencyLabel),
            feedback: parsed.feedback || 'Assessment complete!',
            strengths: parsed.strengths || [],
            areasToImprove: parsed.areasToImprove || []
        };

        return NextResponse.json({ result });

    } catch (error) {
        console.error('[Placement Test] Error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze responses' },
            { status: 500 }
        );
    }
}
