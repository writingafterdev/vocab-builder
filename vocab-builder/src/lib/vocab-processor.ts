/**
 * Vocabulary Processor
 * Pre-builds vocabulary data for articles using Gemini (free tier)
 */

// Pre-built vocabulary item structure
export interface PrebuiltVocabItem {
    phrase: string;              // The word or phrase
    baseForm?: string;           // Dictionary/lemmatized form for dedup
    phonetic?: string;           // IPA pronunciation
    partOfSpeech: string;        // noun, verb, adjective, etc.
    meaning: string;             // English definition
    meaningVi?: string;          // Vietnamese translation
    example?: string;            // Example sentence
    sentenceTranslation?: string; // Vietnamese translation of source sentence

    // For phrases: component words
    words?: Array<{
        word: string;
        meaning: string;
        partOfSpeech: string;
        isHighFrequency: boolean;
    }>;

    // Common usages (collocations, phrasal verbs, idioms)
    commonUsages?: Array<{
        phrase: string;
        meaning: string;
        example?: string;
        type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
    }>;

    // Tags
    isHighFrequency: boolean;    // True for generic high-freq words (make, get, have)
    register?: 'casual' | 'consultative' | 'formal';
    nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    topic?: string;              // null for generic words
    subtopic?: string;
}

// Vocabulary data map (keyed by lowercase phrase)
export type VocabularyDataMap = Record<string, PrebuiltVocabItem>;

import { fetchWithKeyRotation } from './api-key-rotation';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent';

/**
 * Extract all unique words from article text
 */
export function extractUniqueWords(htmlContent: string): string[] {
    // Remove HTML tags
    const text = htmlContent.replace(/<[^>]*>/g, ' ');

    // Extract words (letters only, 3+ chars)
    const words = text
        .toLowerCase()
        .match(/\b[a-z]{3,}\b/g) || [];

    // Remove duplicates and common stop words (Expanded List ~350 words)
    const stopWords = new Set([
        // Articles & Conjunctions
        'the', 'a', 'an', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
        'although', 'because', 'since', 'unless', 'until', 'while', 'where', 'when',

        // Prepositions
        'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about',
        'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against',
        'during', 'without', 'before', 'under', 'around', 'among',

        // Pronouns
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
        'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'theirs',
        'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
        'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what',

        // Verbs (Be, Do, Have & Common Utils)
        'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'having',
        'do', 'does', 'did', 'doing',
        'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
        'get', 'got', 'getting', 'make', 'made', 'making', 'know', 'knew', 'knowing',
        'take', 'took', 'taking', 'see', 'saw', 'seen', 'seeing', 'come', 'came', 'coming',
        'think', 'thought', 'thinking', 'look', 'looked', 'looking', 'want', 'wanted',
        'give', 'gave', 'giving', 'use', 'used', 'using', 'find', 'found', 'finding',
        'tell', 'told', 'telling', 'ask', 'asked', 'asking', 'work', 'worked', 'working',
        'seem', 'seemed', 'seeming', 'feel', 'felt', 'feeling', 'try', 'tried', 'trying',
        'leave', 'left', 'leaving', 'call', 'called', 'calling',

        // Adverbs & Others
        'not', 'no', 'yes', 'now', 'then', 'there', 'here', 'why', 'how',
        'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
        'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'even', 'back',
        'still', 'way', 'well', 'down', 'up', 'out', 'never', 'ever', 'again',
        'forward', 'always', 'away', 'really', 'almost', 'enough', 'perhaps', 'probably',

        // Common Nouns (Time, People, etc. - usually not worth defining unless specific)
        'time', 'year', 'people', 'way', 'day', 'man', 'thing', 'woman', 'life',
        'child', 'world', 'school', 'state', 'family', 'student', 'group', 'country',
        'problem', 'hand', 'part', 'place', 'case', 'week', 'company', 'system',
        'program', 'question', 'work', 'government', 'number', 'night', 'point',
        'home', 'water', 'room', 'mother', 'area', 'money', 'story', 'fact',
        'month', 'lot', 'right', 'study', 'book', 'eye', 'job', 'word', 'business',
        'issue', 'side', 'kind', 'head', 'house', 'service', 'friend', 'father',
        'power', 'hour', 'game', 'line', 'end', 'member', 'law', 'car', 'city',
        'community', 'name', 'president', 'team', 'minute', 'idea', 'kid', 'body',
        'information', 'back', 'parent', 'face', 'others', 'level', 'office', 'door',
        'health', 'person', 'art', 'war', 'history', 'party', 'result', 'change',
        'morning', 'reason', 'research', 'girl', 'guy', 'moment', 'air', 'teacher',
        'force', 'order',
    ]);

    return Array.from(new Set(words)).filter(w => !stopWords.has(w));
}

/**
 * Process words in batches with Gemini
 */
export async function processVocabularyBatch(
    words: string[],
    articleContext: string, // Brief description of article topic
    existingPhrases: string[] = [] // Already extracted phrases
): Promise<VocabularyDataMap> {
    const allItems = [...words, ...existingPhrases];
    const result: VocabularyDataMap = {};

    // Process in batches of 20
    const batchSize = 20;
    for (let i = 0; i < allItems.length; i += batchSize) {
        const batch = allItems.slice(i, i + batchSize);
        const batchResult = await processSingleBatch(batch, articleContext);
        Object.assign(result, batchResult);

        // Small delay moved inside fetchWithKeyRotation logic effectively, 
        // but we keep this if we want to be gentle on our own rate limits if any
        if (i + batchSize < allItems.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    return result;
}

/**
 * Process a single batch of words/phrases
 */
async function processSingleBatch(
    items: string[],
    articleContext: string
): Promise<VocabularyDataMap> {
    const prompt = `Analyze these English words/phrases from an article about "${articleContext}".

For each item, provide:
1. meaning (clear English definition)
2. meaningVi (Vietnamese translation)
3. partOfSpeech (noun, verb, adjective, etc.)
4. example (natural example sentence)
5. isHighFrequency (true if it's a very common word used across all topics like "make", "get", "have", "take", "give", "find", etc.)
6. topic (ONLY if domain-specific, otherwise null. Examples of domain-specific: "profit"→"finance", "diagnosis"→"health")
7. For PHRASES: include "words" array breaking down each word

For phrases (2+ words), also include:
- commonUsages: related expressions (max 3)

Words/Phrases to analyze:
${items.map((item, i) => `${i + 1}. "${item}"`).join('\n')}

Response format (JSON only, no markdown):
{
  "items": [
    {
      "phrase": "make a decision",
      "meaning": "to choose between options after thinking",
      "meaningVi": "đưa ra quyết định",
      "partOfSpeech": "phrase",
      "example": "We need to make a decision by tomorrow.",
      "isHighFrequency": false,
      "topic": "business",
      "subtopic": "decision_making",
      "register": "consultative",
      "nuance": "neutral",
      "words": [
        {"word": "make", "meaning": "to create", "partOfSpeech": "verb", "isHighFrequency": true},
        {"word": "decision", "meaning": "a choice", "partOfSpeech": "noun", "isHighFrequency": false}
      ],
      "commonUsages": [
        {"phrase": "make up your mind", "meaning": "to decide", "type": "idiom"}
      ]
    },
    {
      "phrase": "profit",
      "meaning": "money gained from business",
      "meaningVi": "lợi nhuận",
      "partOfSpeech": "noun",
      "example": "The company made a good profit this year.",
      "isHighFrequency": false,
      "topic": "finance",
      "register": "consultative",
      "nuance": "positive"
    }
  ]
}`;

    try {
        const response = await fetchWithKeyRotation(
            (apiKey) => `${GEMINI_URL}?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4000,
                    },
                }),
            },
            3 // Retry up to 3 times with different keys
        );

        if (!response.ok) {
            console.error('Gemini API error:', response.status);
            return {};
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Clean and parse JSON
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Convert to map and normalize high-frequency words
        const result: VocabularyDataMap = {};
        for (const item of parsed.items || []) {
            const key = item.phrase.toLowerCase();

            // Set topic to 'high_frequency' for generic words so UI shows the special tag
            if (item.isHighFrequency && !item.topic) {
                item.topic = 'high_frequency';
            }

            result[key] = item;
        }

        return result;
    } catch (error) {
        console.error('Batch processing error:', error);
        return {};
    }
}

/**
 * Full vocabulary processing for an article
 */
export async function processArticleVocabulary(
    articleContent: string,
    articleTitle: string,
    extractedPhrases: string[] = []
): Promise<VocabularyDataMap> {
    // Extract unique words from article
    const words = extractUniqueWords(articleContent);

    console.log(`Processing vocabulary: ${words.length} words + ${extractedPhrases.length} phrases`);

    // Process all items
    const vocabData = await processVocabularyBatch(
        words,
        articleTitle,
        extractedPhrases
    );

    console.log(`Processed ${Object.keys(vocabData).length} vocabulary items`);

    return vocabData;
}
