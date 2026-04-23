import { NextRequest, NextResponse } from 'next/server';
import { getDeckPhrasesByStatus, updateDeckPhrase } from '@/lib/db/decks';
import { GENERATE_PHRASE_METADATA_PROMPT } from '@/lib/prompts/deck-prompts';
import { fetchWithKeyRotation } from '@/lib/api-key-rotation';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent';

/**
 * POST /api/admin/deck-generate-metadata
 * Body: { deckId: string }
 * 
 * Batch-generates rich metadata (meaning, register, nuance, etc.)
 * for all pending phrases in a deck.
 */
export async function POST(request: NextRequest) {
    try {
        const { deckId } = await request.json();
        if (!deckId) {
            return NextResponse.json({ error: 'deckId required' }, { status: 400 });
        }

        // We rely on fetchWithKeyRotation to handle keys internally, but we can check if they exist
        if (!process.env.AISTUDIO_API_KEY && !process.env.AISTUDIO_API_KEYS) {
            return NextResponse.json({ error: 'No Gemini API keys configured' }, { status: 500 });
        }

        // Fetch all pending phrases
        const pendingPhrases = await getDeckPhrasesByStatus(deckId, 'pending');
        if (pendingPhrases.length === 0) {
            return NextResponse.json({ processed: 0, failed: 0, message: 'No pending phrases' });
        }

        let processed = 0;
        let failed = 0;

        // Process in batches of 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < pendingPhrases.length; i += BATCH_SIZE) {
            const batch = pendingPhrases.slice(i, i + BATCH_SIZE);
            const phraseList = batch.map((p, idx) => `${idx + 1}. "${p.phrase}"`).join('\n');
            const prompt = GENERATE_PHRASE_METADATA_PROMPT.replace('{PHRASES}', phraseList);

            try {
                const response = await fetchWithKeyRotation(
                    (key) => `${GEMINI_URL}?key=${key}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                temperature: 0.3,
                                maxOutputTokens: 6000,
                            },
                        }),
                    },
                    3
                );

                if (!response.ok) {
                    console.error(`[DeckMeta] Gemini API error:`, response.status);
                    for (const p of batch) {
                        await updateDeckPhrase(p.id, { metadataStatus: 'failed' });
                        failed++;
                    }
                    continue;
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

                let parsed: any;
                try {
                    parsed = JSON.parse(cleaned);
                } catch {
                    console.error('[DeckMeta] Failed to parse JSON response');
                    for (const p of batch) {
                        await updateDeckPhrase(p.id, { metadataStatus: 'failed' });
                        failed++;
                    }
                    continue;
                }

                const items = parsed.items || parsed;
                if (!Array.isArray(items)) {
                    for (const p of batch) {
                        await updateDeckPhrase(p.id, { metadataStatus: 'failed' });
                        failed++;
                    }
                    continue;
                }

                // Match AI output back to our phrases
                for (const p of batch) {
                    const match = items.find(
                        (item: any) => item.phrase?.toLowerCase().trim() === p.phrase.toLowerCase().trim()
                    );

                    if (match) {
                        await updateDeckPhrase(p.id, {
                            meaning: match.meaning || '',
                            meaningVi: match.meaningVi || '',
                            phonetic: match.phonetic || '',
                            partOfSpeech: match.partOfSpeech || '',
                            register: match.register || undefined,
                            nuance: match.nuance || undefined,
                            example: match.example || '',
                            commonUsages: match.commonUsages || undefined,
                            topic: match.topic || undefined,
                            subtopic: match.subtopic || undefined,
                            isHighFrequency: match.isHighFrequency || false,
                            metadataStatus: 'generated',
                        });
                        processed++;
                    } else {
                        await updateDeckPhrase(p.id, { metadataStatus: 'failed' });
                        failed++;
                    }
                }
            } catch (err) {
                console.error('[DeckMeta] Batch processing error:', err);
                for (const p of batch) {
                    await updateDeckPhrase(p.id, { metadataStatus: 'failed' });
                    failed++;
                }
            }

            // Rate limit between batches
            if (i + BATCH_SIZE < pendingPhrases.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        return NextResponse.json({ processed, failed, total: pendingPhrases.length });
    } catch (error: any) {
        console.error('[DeckMeta] Fatal error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
