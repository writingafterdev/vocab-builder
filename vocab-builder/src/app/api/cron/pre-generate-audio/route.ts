import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, updateDocument, setDocument, serverTimestamp } from '@/lib/firestore-rest';
import { getApiKeyCount } from '@/lib/api-key-rotation';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getGrokKey } from '@/lib/grok-client';
import type { SavedPhrase } from '@/lib/db/types';

// Cron secret to protect the endpoint
const CRON_SECRET = process.env.CRON_SECRET;
const XAI_API_KEY = getGrokKey('exercises');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

// ─── Interfaces ───────────────────────────────────────

interface SimpleCluster {
    topic: string;
    register: string;
    phrases: SavedPhrase[];
}

interface GeneratedSection {
    id: string;
    content: string;
    vocabPhrases: string[];
    audioUrl?: string; // Newly added for pre-generated audio
}

interface ComprehensionQuestion {
    id: string;
    afterSectionId: string;
    question: string;
    options: string[];
    correctIndex: number;
    targetPhrase: string;
    explanation: string;
}

interface GeneratedSession {
    id?: string;
    userId: string;
    title: string;
    subtitle: string;
    sections: GeneratedSection[];
    questions: ComprehensionQuestion[];
    quotes: Array<{
        text: string;
        highlightedPhrases: string[];
    }>;
    phraseIds: string[];
    totalPhrases: number;
    status: 'generated' | 'in_progress' | 'completed';
    createdAt: string;
    isListeningDay: boolean;
    reviewDayIndex: number;
}

// ─── Main Handler ─────────────────────────────────────

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

        if (!XAI_API_KEY) {
            return NextResponse.json({ error: 'Grok Key not configured' }, { status: 500 });
        }

        // Get tomorrow's date limits
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

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
            const allPhrases = await queryCollection('savedPhrases') as unknown as SavedPhrase[];
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
            const listeningPhrases = userPhrases.filter(p => (Number(p.learningStep) || 0) > 0).slice(0, 20);

            if (listeningPhrases.length === 0) {
                results.push({ userId, status: 'all_step_0', count: 0 });
                continue;
            }

            // Generate full article for tomorrow's session
            try {
                const clusters = clusterPhrasesByTopic(listeningPhrases);
                const articleResult = await generateMergedArticle(clusters, userId);
                
                if (!articleResult) {
                    throw new Error('Failed to generate LLM article');
                }

                const { callGrokTTS } = await import('@/lib/grok-tts');
                const { uploadToFirebaseStorage, generateAudioPath } = await import('@/lib/firebase-storage');

                // Pre-generate audio for each chunk (section) of the generated article
                for (const section of articleResult.sections) {
                    // Quick sleep to avoid TTS rate limits if any
                    await new Promise(r => setTimeout(r, 500));
                    
                    const { audio, mimeType } = await callGrokTTS(section.content, { voiceId: 'eve' });
                    const extension = mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
                    const audioPath = generateAudioPath(userId, 'exercise', `${Date.now()}-${section.id}`).replace('.wav', `.${extension}`);
                    const downloadUrl = await uploadToFirebaseStorage(audio, audioPath, mimeType);
                    
                    if (downloadUrl) {
                        section.audioUrl = downloadUrl;
                    } else {
                        console.warn(`[Cron] Failed to upload audio for section ${section.id}`);
                    }
                }

                // Create the GeneratedSession Document
                const session: Omit<GeneratedSession, 'id'> = {
                    userId,
                    title: articleResult.title,
                    subtitle: articleResult.subtitle,
                    sections: articleResult.sections,
                    questions: articleResult.questions,
                    quotes: articleResult.quotes,
                    phraseIds: listeningPhrases.map(p => p.id as string),
                    totalPhrases: listeningPhrases.length,
                    status: 'generated', // Stored in advance!
                    createdAt: serverTimestamp() as any,
                    isListeningDay: true,
                    reviewDayIndex: tomorrowCount,
                };
        
                const docId = `session_${userId}_${Date.now()}`;
                await setDocument('generatedSessions', docId, session);

                // Try to update the user's reviewDayCount — this may fail with 403
                // since cron jobs don't have a user auth token. The count will be
                // updated when the user opens the session via generate-session-article.
                try {
                    await updateDocument('users', userId, {
                        'stats.reviewDayCount': tomorrowCount,
                    });
                } catch (err) {
                    console.warn(`[Cron] Could not update reviewDayCount for ${userId}, will sync on next session open`);
                }

                totalGenerated++;
                results.push({ userId, status: `generated_listening_session`, count: listeningPhrases.length });
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

export async function GET(request: NextRequest) {
    return POST(request);
}

// ─── Deterministic Clustering ─────────────────────────

function clusterPhrasesByTopic(phrases: SavedPhrase[]): SimpleCluster[] {
    const groups = new Map<string, SavedPhrase[]>();

    for (const phrase of phrases) {
        const topic = phrase.topics?.[0] || 'general';
        const register = phrase.register || 'consultative';
        const key = `${topic}__${register}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(phrase);
    }

    const clusters: SimpleCluster[] = [];
    const mixed: SavedPhrase[] = [];

    for (const [key, groupPhrases] of groups) {
        const [topic, register] = key.split('__');
        if (groupPhrases.length >= 2) {
            clusters.push({ topic, register, phrases: groupPhrases });
        } else {
            mixed.push(...groupPhrases);
        }
    }

    if (mixed.length > 0) {
        clusters.push({
            topic: 'mixed',
            register: 'consultative',
            phrases: mixed,
        });
    }

    return clusters;
}

// ─── AI Article Generation ────────────────────────────

async function generateMergedArticle(
    clusters: SimpleCluster[],
    userId: string
): Promise<{
    title: string;
    subtitle: string;
    sections: GeneratedSection[];
    questions: ComprehensionQuestion[];
    quotes: Array<{ text: string; highlightedPhrases: string[] }>;
} | null> {
    const allPhrases = clusters.flatMap(c => c.phrases);
    const phraseInventory = allPhrases.map(p =>
        `- "${p.phrase}" (${p.meaning || 'contextual'}${p.register ? `, register: ${p.register}` : ''})`
    ).join('\n');

    const clusterDescriptions = clusters.map((c, i) =>
        `Group ${i + 1} [${c.topic}/${c.register}]: ${c.phrases.map(p => `"${p.phrase}"`).join(', ')}`
    ).join('\n');

    const phraseCount = allPhrases.length;
    const wordTarget = phraseCount <= 5 ? '400-600' :
                       phraseCount <= 10 ? '600-900' :
                       phraseCount <= 15 ? '900-1200' : '1200-1500';

    const questionsTarget = Math.min(Math.ceil(phraseCount * 0.6), 8);

    const prompt = `You are a Substack-style writer creating a compelling, immersive article. Your articles get readers hooked from the first line, tell stories that linger, and teach vocabulary through CONTEXT — never through definitions.

PHRASES TO WEAVE IN:
${phraseInventory}

THEMATIC GROUPS:
${clusterDescriptions}

YOUR TASK: Write ONE cohesive article that naturally incorporates ALL the phrases above. The article should feel like a real Substack post — engaging, opinionated, with a strong narrative voice.

CRITICAL RULES:

1. **STRUCTURE**: The article must flow through the thematic groups NATURALLY. Don't abruptly jump topics.
2. **CONTEXT LAYERING** (for each phrase): BEFORE, PHRASE, AFTER.
3. **TONE**: Write like a real person, not a textbook.
4. **LENGTH**: ${wordTarget} words, divided into 3-6 sections. Use the 'sections' array in the JSON response to break up the article into logical parts. Each section will be synthesized into a separate snippet of audio. Keep them reasonably short.
5. **COMPREHENSION QUESTIONS** (${questionsTarget} total): Test understanding of a specific phrase through story comprehension.
6. **EXTRACTABLE QUOTES**: Include 2-3 sentences that work as standalone quotes.

RESPOND IN JSON:
{
  "title": "A catchy, Substack-worthy title",
  "subtitle": "A compelling one-line hook",
  "sections": [
    {
      "id": "section_1",
      "content": "The full text of this section (multiple paragraphs OK)",
      "vocabPhrases": ["phrase1", "phrase2"]
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "afterSectionId": "section_2",
      "question": "Story-based comprehension question",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1,
      "targetPhrase": "the phrase being tested",
      "explanation": "Brief explanation"
    }
  ],
  "quotes": [
    {
      "text": "A vivid sentence",
      "highlightedPhrases": ["phrase that appears"]
    }
  ]
}`;

    try {
        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-non-reasoning',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an award-winning Substack writer who teaches vocabulary through immersive storytelling. You respond ONLY in valid JSON. Your writing is vivid, opinionated, and emotionally engaging.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            console.error('AI API error:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail: 'cron-job',
                endpoint: 'pre-generate-audio',
                model: 'grok-4-1-fast-non-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const parseResult = safeParseAIJson<{
            title: string;
            subtitle: string;
            sections: GeneratedSection[];
            questions: ComprehensionQuestion[];
            quotes: Array<{ text: string; highlightedPhrases: string[] }>;
        }>(content);

        if (!parseResult.success) {
            return null;
        }

        const article = parseResult.data;

        if (!article.sections || article.sections.length === 0) {
            return null;
        }

        article.sections = article.sections.map((s, i) => ({
            ...s,
            id: s.id || `section_${i + 1}`,
            vocabPhrases: s.vocabPhrases || [],
        }));

        article.questions = (article.questions || []).map((q, i) => ({
            ...q,
            id: q.id || `q_${i + 1}`,
            afterSectionId: q.afterSectionId || article.sections[Math.min(i, article.sections.length - 1)].id,
        }));

        article.quotes = (article.quotes || []).slice(0, 3);
        return article;
    } catch (error) {
        console.error('AI article generation failed:', error);
        return null;
    }
}
