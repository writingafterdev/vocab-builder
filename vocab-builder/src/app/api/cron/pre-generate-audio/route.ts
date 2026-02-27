import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, updateDocument } from '@/lib/firestore-rest';
import { getApiKeyCount } from '@/lib/api-key-rotation';

/**
 * Cron job to pre-generate audio for tomorrow's listening exercises
 * 
 * Uses Edge TTS (free, returns MP3) with Gemini TTS fallback.
 * Should be called nightly via Cloudflare scheduled worker.
 */

// Cron secret to protect the endpoint
const CRON_SECRET = process.env.CRON_SECRET;

// Clean HTML content to plain text for TTS
function cleanTextForTTS(html: string): string {
    let text = html.replace(/<[^>]*>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

export async function POST(request: NextRequest) {
    try {
        // Verify cron secret
        const authHeader = request.headers.get('Authorization');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (getApiKeyCount() === 0) {
            return NextResponse.json({ error: 'No API keys configured' }, { status: 500 });
        }

        // Get tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        // Get all users with their review day counts
        const users = await queryCollection('users');

        let totalGenerated = 0;
        let totalErrors = 0;
        const results: { userId: string; status: string; count: number }[] = [];

        for (const user of users) {
            const userId = user.id as string;
            const stats = (user.stats || {}) as { reviewDayCount?: number };
            const currentCount = stats.reviewDayCount || 0;

            // Tomorrow's count will be incremented by 1
            const tomorrowCount = currentCount + 1;
            const isTomorrowListening = tomorrowCount % 2 === 1;

            if (!isTomorrowListening) {
                // Tomorrow is a reading day, skip audio generation
                results.push({ userId, status: 'skipped_reading_day', count: 0 });
                continue;
            }

            // Get phrases due tomorrow for this user
            const allPhrases = await queryCollection('savedPhrases');
            const userPhrases = allPhrases.filter(p => {
                if (p.userId !== userId) return false;
                const reviewDate = p.nextReviewDate as any;
                if (!reviewDate) return false;

                let reviewMs: number;
                if (typeof reviewDate.toMillis === 'function') {
                    reviewMs = reviewDate.toMillis();
                } else if (reviewDate._seconds) {
                    reviewMs = reviewDate._seconds * 1000;
                } else {
                    reviewMs = new Date(reviewDate).getTime();
                }

                return reviewMs >= tomorrow.getTime() && reviewMs <= tomorrowEnd.getTime();
            });

            if (userPhrases.length === 0) {
                results.push({ userId, status: 'no_due_phrases', count: 0 });
                continue;
            }

            // Skip step 0 phrases (they always get reading)
            const listeningPhrases = userPhrases.filter(p => (Number(p.learningStep) || 0) > 0);

            if (listeningPhrases.length === 0) {
                results.push({ userId, status: 'all_step_0', count: 0 });
                continue;
            }

            // Generate sample content for these phrases (simplified - in production, generate full story)
            const phraseList = listeningPhrases.map(p =>
                `${p.phrase}: ${p.meaning}`
            ).join('\n');

            const contentToSpeak = `Practice session with the following vocabulary:\n\n${phraseList}`;

            // Generate audio using Edge TTS (free, MP3) with Gemini fallback
            try {
                const { generateTTSWithFallback } = await import('@/lib/edge-tts');
                const { uploadToFirebaseStorage, generateAudioPath } = await import('@/lib/firebase-storage');
                const { getFirstApiKey } = await import('@/lib/api-key-rotation');

                const { audio, mimeType, source } = await generateTTSWithFallback(
                    contentToSpeak,
                    { voice: 'en-US-AriaNeural' },
                    getFirstApiKey() // Pass Gemini key for fallback
                );

                console.log(`[Cron] Generated audio via ${source}, size: ${audio.length} bytes, type: ${mimeType}`);

                // Generate unique path and upload
                const extension = mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
                const audioPath = generateAudioPath(userId, 'exercise', Date.now().toString()).replace('.wav', `.${extension}`);
                const downloadUrl = await uploadToFirebaseStorage(audio, audioPath, mimeType);

                if (downloadUrl) {
                    // Store audio URL on each phrase for retrieval during practice
                    for (const phrase of listeningPhrases) {
                        await updateDocument('savedPhrases', phrase.id as string, {
                            preGeneratedAudio: {
                                url: downloadUrl,
                                path: audioPath,
                                generatedAt: new Date().toISOString(),
                                mimeType,
                                source, // 'edge' or 'gemini'
                            },
                        });
                    }

                    totalGenerated++;
                    results.push({ userId, status: `generated_${source}`, count: listeningPhrases.length });
                } else {
                    throw new Error('Failed to upload audio to storage');
                }
            } catch (error) {
                totalErrors++;
                results.push({
                    userId,
                    status: `error: ${error instanceof Error ? error.message : 'unknown'}`,
                    count: 0
                });
            }
        }

        return NextResponse.json({
            success: true,
            totalUsers: users.length,
            totalGenerated,
            totalErrors,
            results,
        });

    } catch (error) {
        console.error('Pre-generate audio cron error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Also allow GET for testing
export async function GET(request: NextRequest) {
    return POST(request);
}
