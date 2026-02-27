import { NextRequest, NextResponse } from 'next/server';

// Free Dictionary API: https://dictionaryapi.dev/
const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

interface DictionaryMeaning {
    partOfSpeech: string;
    definitions: Array<{
        definition: string;
        example?: string;
        synonyms?: string[];
    }>;
}

interface DictionaryResponse {
    word: string;
    phonetic?: string;
    phonetics?: Array<{
        text?: string;
        audio?: string;
    }>;
    meanings: DictionaryMeaning[];
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const word = searchParams.get('word');

    if (!word) {
        return NextResponse.json({ error: 'Word parameter is required' }, { status: 400 });
    }

    // Clean the word - only single words work with dictionary
    const cleanWord = word.trim().toLowerCase();

    // If it's a phrase (has spaces), return not found - will trigger AI fallback
    if (cleanWord.includes(' ')) {
        return NextResponse.json({
            found: false,
            isPhrase: true,
            word: cleanWord,
            message: 'Phrases are not in dictionary'
        }, { status: 200 });
    }

    try {
        const response = await fetch(`${DICTIONARY_API_URL}/${encodeURIComponent(cleanWord)}`);

        if (!response.ok) {
            // Word not found in dictionary
            if (response.status === 404) {
                return NextResponse.json({
                    found: false,
                    word: cleanWord,
                    message: 'Word not found in dictionary'
                }, { status: 200 });
            }
            throw new Error(`Dictionary API error: ${response.status}`);
        }

        const data: DictionaryResponse[] = await response.json();
        const entry = data[0];

        // Find the best phonetic with audio
        const phoneticWithAudio = entry.phonetics?.find(p => p.audio && p.text);
        const phonetic = phoneticWithAudio?.text || entry.phonetic || entry.phonetics?.find(p => p.text)?.text;
        const audioUrl = phoneticWithAudio?.audio || entry.phonetics?.find(p => p.audio)?.audio;

        // Get all meanings with their definitions
        const meanings = entry.meanings.map(m => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions.slice(0, 3).map(d => ({
                definition: d.definition,
                example: d.example,
            })),
        }));

        // Cache dictionary results for 24 hours (word definitions don't change)
        return NextResponse.json({
            found: true,
            word: entry.word,
            phonetic,
            audioUrl,
            meanings,
        }, {
            headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400', // 24 hours
            }
        });

    } catch (error) {
        console.error('Dictionary API error:', error);
        return NextResponse.json({
            found: false,
            word: cleanWord,
            error: 'Dictionary lookup failed'
        }, { status: 200 }); // Return 200 so client can fallback to AI
    }
}
