import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';

/**
 * Generate phrase meaning using DeepSeek AI (context-aware)
 * + fetch pronunciation (IPA/audio) from Free Dictionary API
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const DICTIONARY_API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

interface GenerateMeaningRequest {
    phrase: string;
    context?: string;
}

// Fetch pronunciation for a word from Free Dictionary API
async function fetchPronunciation(phrase: string): Promise<{ phonetic?: string; audioUrl?: string }> {
    try {
        // For phrases, try the first word or the root word
        const words = phrase.trim().split(/\s+/);
        // Try last word first (usually the main verb in phrasal verbs), then first word
        const wordsToTry = words.length > 1 ? [words[words.length - 1], words[0]] : words;

        for (const word of wordsToTry) {
            const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
            if (!cleanWord) continue;

            const response = await fetch(`${DICTIONARY_API_URL}/${encodeURIComponent(cleanWord)}`);
            if (!response.ok) continue;

            const data = await response.json();
            const entry = data[0];

            // Find phonetic with audio
            const phoneticWithAudio = entry?.phonetics?.find((p: { audio?: string; text?: string }) => p.audio && p.text);
            const phonetic = phoneticWithAudio?.text || entry?.phonetic || entry?.phonetics?.find((p: { text?: string }) => p.text)?.text;
            const audioUrl = phoneticWithAudio?.audio || entry?.phonetics?.find((p: { audio?: string }) => p.audio)?.audio;

            if (phonetic || audioUrl) {
                return { phonetic, audioUrl };
            }
        }
        return {};
    } catch {
        return {};
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateMeaningRequest = await request.json();
        const { phrase, context } = body;

        if (!phrase) {
            return NextResponse.json(
                { error: 'Phrase is required' },
                { status: 400 }
            );
        }

        if (!XAI_API_KEY) {
            // Return mock response if no API key (for development)
            return NextResponse.json({
                meaning: `A common English expression or phrase that conveys a specific meaning in context.`,
                difficulty: 'intermediate',
                success: true,
                isMock: true
            });
        }

        const prompt = `You are a vocabulary learning specialist who helps intermediate English learners remember phrases forever.

PHRASE: "${phrase}"
${context ? `ENCOUNTERED IN: "${context}"` : ''}

Your job is to create a MEMORABLE explanation that sticks in the learner's mind. 

PROVIDE:

1. **CORE MEANING** (1 sentence)
   - What does this phrase fundamentally mean?
   - Be precise but natural (avoid dictionary-speak)

2. **STICKY SCENARIO** (1-2 sentences)
   - Create ONE vivid, specific situation where this phrase fits perfectly
   - Make it emotional or surprising so it sticks in memory
   - Example: Instead of "used when busy" → "Imagine you're juggling three coffee cups while your phone rings..."

3. **THE FEEL** (1 sentence)
   - How do native speakers FEEL when they hear/use this phrase?
   - Is it casual? Warm? Professional? Slightly sarcastic? Empathetic?

4. **TOPICS** (2-3 topic areas where this phrase is commonly used)
   - Categories like: "Business", "Relationships", "Travel", "Technology", "Health", "Education", "Entertainment", "Social", "Work", "Finance", etc.
   - Also provide 2-3 specific subtopics for each main topic

5. **COMMON MISTAKE** (optional, only if there's a real one)
   - What do learners often get wrong with this phrase?

Combine these into ONE flowing explanation (2-4 sentences total). Start with meaning, include the scenario naturally, mention the feel.

REGISTER classification:
- "casual" = Friends/family, texting, social media
- "consultative" = Everyday professional, neutral settings  
- "formal" = Business writing, academic, official

NUANCE classification:
- "positive" / "slightly_positive" / "neutral" / "slightly_negative" / "negative"

JSON RESPONSE:
{
  "meaning": "Your memorable 2-4 sentence explanation here...",
  "stickyScenario": "The vivid scenario for quick recall",
  "commonMistake": "What learners often get wrong (or null)",
  "topics": ["Topic1", "Topic2"],
  "subtopics": ["Subtopic1", "Subtopic2", "Subtopic3"],
  "register": "casual|consultative|formal",
  "nuance": "positive|slightly_positive|neutral|slightly_negative|negative"
}`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to generate meaning' },
                { status: 500 }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        // Log token usage
        const userId = request.headers.get('x-user-id') || 'anonymous';
        const userEmail = request.headers.get('x-user-email') || 'anonymous';
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'generate-meaning',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        if (!content) {
            return NextResponse.json(
                { error: 'No content generated' },
                { status: 500 }
            );
        }

        // Fetch pronunciation (IPA + audio) from Free Dictionary API
        const pronunciation = await fetchPronunciation(phrase);

        // Parse JSON response
        try {
            const jsonMatch = content.match(/\{[\s\S]*"meaning"[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return NextResponse.json({
                    meaning: parsed.meaning,
                    topics: parsed.topics || [],
                    subtopics: parsed.subtopics || [],
                    register: parsed.register || 'consultative',
                    nuance: parsed.nuance || 'neutral',
                    phonetic: pronunciation.phonetic,
                    audioUrl: pronunciation.audioUrl,
                    success: true,
                });
            }

            // Fallback: just return the content
            return NextResponse.json({
                meaning: content,
                topics: [],
                subtopics: [],
                register: 'consultative',
                nuance: 'neutral',
                phonetic: pronunciation.phonetic,
                audioUrl: pronunciation.audioUrl,
                success: true,
            });
        } catch {
            return NextResponse.json({
                meaning: content,
                topics: [],
                subtopics: [],
                register: 'consultative',
                nuance: 'neutral',
                success: true,
            });
        }

    } catch {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
