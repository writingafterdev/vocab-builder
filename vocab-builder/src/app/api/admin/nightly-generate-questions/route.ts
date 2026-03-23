import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, updateDocument, serverTimestamp } from '@/lib/appwrite/database';

/**
 * Nightly job to generate MCQ questions for saved phrases
 * Called by Vercel Cron or external scheduler
 * 
 * Generates practice questions for phrases that:
 * 1. Don't have questions yet
 * 2. Haven't been updated recently
 */
export async function POST(request: NextRequest) {
    try {
        // Verify cron secret for security
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get phrases that need questions generated
        const phrases = await queryCollection('globalPhraseData', {
            where: [{ field: 'questions', op: '==', value: null }],
            limit: 10,
        });

        let processed = 0;
        const results: { phrase: string; success: boolean; error?: string }[] = [];

        for (const phraseData of phrases) {
            try {
                // TODO: Call AI to generate questions
                // For now, create placeholder structure
                const questions = {
                    root: [],
                    usages: [],
                    variants: [],
                    generatedAt: serverTimestamp(),
                };

                await updateDocument('globalPhraseData', phraseData.id, {
                    questions,
                    questionsGeneratedAt: serverTimestamp(),
                });

                processed++;
                results.push({ phrase: phraseData.phrase as string, success: true });
            } catch (error) {
                results.push({
                    phrase: phraseData.phrase as string,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            total: phrases.length,
            results,
        });

    } catch (error) {
        console.error('Nightly generate questions error:', error);
        return NextResponse.json(
            { error: 'Failed to generate questions' },
            { status: 500 }
        );
    }
}

// GET endpoint for status check
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        description: 'Nightly job to generate MCQ questions for phrases',
    });
}
