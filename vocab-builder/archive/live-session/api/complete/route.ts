import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument } from '@/lib/firestore-rest';

interface CompleteSessionRequest {
    sessionId: string;
    transcript: string;
    durationSeconds: number;
}

interface PhraseResult {
    phraseId: string;
    phrase: string;
    used: boolean;
    context?: string;  // The sentence where it was used
}

/**
 * Complete a Live Session
 * 
 * Analyzes the transcript to detect phrase usage,
 * updates SRS based on results
 */
export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CompleteSessionRequest = await request.json();
        const { sessionId, transcript = '', durationSeconds } = body;

        console.log('[Live Session Complete] sessionId:', sessionId);
        console.log('[Live Session Complete] transcript length:', transcript?.length || 0);
        console.log('[Live Session Complete] durationSeconds:', durationSeconds);

        if (!sessionId) {
            console.log('[Live Session Complete] ERROR: Missing sessionId');
            return NextResponse.json(
                { error: 'sessionId required' },
                { status: 400 }
            );
        }

        // Get session data
        const session = await getDocument('liveSessions', sessionId);
        if (!session) {
            return NextResponse.json(
                { error: 'Session not found' },
                { status: 404 }
            );
        }

        if (session.userId !== userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        // Get the phrases being tested
        const phraseIds = session.phraseIds as string[];
        const results: PhraseResult[] = [];
        let passedCount = 0;
        let totalCount = 0;

        // Normalize transcript for matching
        const normalizedTranscript = transcript.toLowerCase();

        for (const phraseId of phraseIds) {
            // Use GLOBAL savedPhrases collection (NOT subcollection)
            const phraseDoc = await getDocument('savedPhrases', phraseId);
            if (!phraseDoc) continue;

            const phrase = phraseDoc.phrase as string;
            const normalizedPhrase = phrase.toLowerCase();

            // Check if phrase was used in transcript
            const used = normalizedTranscript.includes(normalizedPhrase);

            // Try to extract context (sentence containing the phrase)
            let context: string | undefined;
            if (used) {
                const sentences = transcript.split(/[.!?]+/);
                context = sentences.find(s =>
                    s.toLowerCase().includes(normalizedPhrase)
                )?.trim();
            }

            results.push({
                phraseId,
                phrase,
                used,
                context
            });

            totalCount++;
            if (used) passedCount++;

            // Update phrase SRS based on result
            const newStatus = used ? 'passed' : 'failed';
            const updates: Record<string, any> = {
                liveSessionStatus: newStatus,
                lastLiveSessionDate: new Date().toISOString(),
                liveSessionAttempts: ((phraseDoc.liveSessionAttempts as number) || 0) + 1
            };

            // If passed, advance to next step
            if (used) {
                const currentStep = (phraseDoc.learningStep as number) || 3;
                updates.learningStep = Math.min(currentStep + 1, 6);

                // Update next review date based on new step
                const intervals = [1, 3, 7, 14, 30, 90];
                const daysToAdd = intervals[Math.min(updates.learningStep, intervals.length - 1)];
                const nextReview = new Date();
                nextReview.setDate(nextReview.getDate() + daysToAdd);
                updates.nextReviewDate = nextReview;
            }

            await updateDocument('savedPhrases', phraseId, updates);
        }

        // Calculate score
        const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

        // Update session with results
        await updateDocument('liveSessions', sessionId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            durationSeconds,
            transcript,
            phrasesUsed: results.filter(r => r.used).map(r => r.phraseId),
            score,
            passedCount,
            totalCount
        });

        // Determine feedback message
        let feedback: string;
        if (score >= 80) {
            feedback = "Excellent! You used most phrases naturally in conversation.";
        } else if (score >= 50) {
            feedback = "Good effort! Some phrases need more practice.";
        } else {
            feedback = "Keep practicing! These phrases will come more naturally with time.";
        }

        return NextResponse.json({
            success: true,
            results,
            score,
            passedCount,
            totalCount,
            feedback,
            durationSeconds
        });

    } catch (error) {
        console.error('Complete live session error:', error);
        return NextResponse.json(
            { error: 'Failed to complete live session' },
            { status: 500 }
        );
    }
}
