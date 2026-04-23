import { NextRequest, NextResponse } from 'next/server';
import { getDeck, getDeckPhrases } from '@/lib/db/decks';
import { addQuotesToBank } from '@/lib/db/quote-feed';
import {
    GENERATE_LINGUISTIC_DECK_CONTENT_PROMPT,
    GENERATE_THEMATIC_DECK_CONTENT_PROMPT,
} from '@/lib/prompts/deck-prompts';
import { fetchWithKeyRotation } from '@/lib/api-key-rotation';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent';

function pickRandom<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
}

/**
 * POST /api/admin/deck-generate-content
 * Body: { deckId: string, count?: number }
 * 
 * Generates quotes & facts that embed deck-specific vocabulary.
 * - Linguistic decks: forces inclusion of phrase list
 * - Thematic decks: generates freely within topic domain
 */
export async function POST(request: NextRequest) {
    try {
        const { deckId, count = 10 } = await request.json();
        if (!deckId) {
            return NextResponse.json({ error: 'deckId required' }, { status: 400 });
        }

        if (!process.env.AISTUDIO_API_KEY && !process.env.AISTUDIO_API_KEYS) {
            return NextResponse.json({ error: 'No Gemini API keys configured' }, { status: 500 });
        }

        const deck = await getDeck(deckId);
        if (!deck) {
            return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
        }

        let prompt: string;

        const allPhrases = await getDeckPhrases(deckId);

        if (deck.type === 'linguistic') {
            // Linguistic deck: force-include phrases
            if (allPhrases.length === 0) {
                return NextResponse.json({ error: 'No phrases in deck. Import phrases first.' }, { status: 400 });
            }

            // Pick a subset to keep prompts manageable (max 15 per generation)
            const targetPhrases = pickRandom(allPhrases.map(p => p.phrase), Math.min(15, allPhrases.length));
            prompt = GENERATE_LINGUISTIC_DECK_CONTENT_PROMPT
                .replace('{DECK_PHRASES}', targetPhrases.map(p => `- ${p}`).join('\n'))
                .replace('{COUNT}', String(count));
        } else {
            // Thematic deck: topic-focused free generation
            prompt = GENERATE_THEMATIC_DECK_CONTENT_PROMPT
                .replaceAll('{DECK_TOPIC}', deck.name)
                .replace('{COUNT}', String(count));
        }

        const response = await fetchWithKeyRotation(
            (key) => `${GEMINI_URL}?key=${key}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.6,
                        maxOutputTokens: 6000,
                    },
                }),
            },
            3
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[DeckContent] Gemini API error:', response.status, errorText);
            return NextResponse.json({ error: `Gemini API error: ${response.status}` }, { status: 502 });
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let generatedFacts: any[];
        try {
            generatedFacts = JSON.parse(cleaned);
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        if (!Array.isArray(generatedFacts)) {
            return NextResponse.json({ error: 'AI returned non-array response' }, { status: 500 });
        }

        const validFacts = generatedFacts.filter(f => f.text && f.topic);

        const quoteEntries = validFacts.map(fact => {
            const tags = Array.isArray(fact.tags) ? fact.tags.map((t: string) => t.toLowerCase()) : [];
            // Tag with deck ID for attribution
            tags.push(`deck:${deckId}`);

            const highlightedPhrases = Array.isArray(fact.highlightedPhrases) ? fact.highlightedPhrases : [];
            const vocabularyData: Record<string, any> = {};

            // Map deck phrases to vocabularyData for instant lookup
            for (const highlighted of highlightedPhrases) {
                const lowerHighlighted = typeof highlighted === 'string' ? highlighted.toLowerCase().trim() : '';
                if (!lowerHighlighted) continue;
                
                // Find matching deck phrase
                const deckPhrase = allPhrases.find(p => p.phrase.toLowerCase() === lowerHighlighted);
                if (deckPhrase && deckPhrase.metadataStatus === 'generated') {
                    vocabularyData[lowerHighlighted] = {
                        phrase: deckPhrase.phrase,
                        phonetic: deckPhrase.phonetic || '',
                        partOfSpeech: deckPhrase.partOfSpeech || 'unknown',
                        meaning: deckPhrase.meaning || '',
                        meaningVi: deckPhrase.meaningVi || '',
                        example: deckPhrase.example || '',
                        isHighFrequency: deckPhrase.isHighFrequency || false,
                        register: deckPhrase.register,
                        nuance: deckPhrase.nuance,
                        topic: deckPhrase.topic,
                        subtopic: deckPhrase.subtopic
                    };
                }
            }

            return {
                text: fact.text,
                postId: `deck_${deckId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                postTitle: `${deck.name} — ${fact.topic}`,
                author: fact.author || 'Vocab AI',
                source: `Deck: ${deck.name}`,
                topic: fact.topic.toLowerCase(),
                highlightedPhrases,
                tags,
                sourceType: 'generated_fact' as const,
                createdAt: new Date().toISOString(),
                vocabularyData: Object.keys(vocabularyData).length > 0 ? vocabularyData : undefined,
            };
        });

        if (quoteEntries.length > 0) {
            await addQuotesToBank(quoteEntries);
        }

        return NextResponse.json({
            generated: quoteEntries.length,
            deckId,
            deckName: deck.name,
            deckType: deck.type,
            facts: quoteEntries,
        });
    } catch (error: any) {
        console.error('[DeckContent] Fatal error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
