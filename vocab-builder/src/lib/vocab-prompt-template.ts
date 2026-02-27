/**
 * Vocabulary Extraction Prompt Template
 * 
 * Extracts ALL unique words and phrases from an article to enable
 * instant lookup for any word the user clicks.
 * 
 * Output format:
 * - sentences: Array of {en, vi} for each sentence with translation
 * - phrases: ALL unique words + multi-word expressions
 */

import { TopicDocument } from '@/lib/db/topics';

/**
 * Build vocabulary extraction prompt with dynamic topics
 */
export function buildVocabPrompt(
  articleTitle: string,
  articleContent: string,
  topics: TopicDocument[]
): string {
  // Format topics for prompt
  const topicList = topics.length > 0
    ? topics.map(t => {
      const subtopics = t.subtopics?.map(s => s.label).join(', ') || 'none';
      return `- ${t.label} (id: ${t.id}): subtopics: [${subtopics}]`;
    }).join('\n')
    : "No existing topics yet. You may create new ones.";

  return `Analyze this English article and return JSON with translations and vocabulary for EVERY unique word and phrase.

ARTICLE TITLE: "${articleTitle || 'Untitled'}"
ARTICLE CONTENT:
"""
${articleContent.substring(0, 50000)}
"""

TASKS:
1. Split article into sentences
2. Translate each sentence to Vietnamese
3. Extract ALL unique words AND multi-word phrases (collocations, phrasal verbs, idioms)
   - Include EVERY word that appears in the article
   - Also extract multi-word expressions that learners should know as a unit

FOR EACH WORD/PHRASE, provide:
- phrase: the word or phrase
- baseForm: dictionary/lemmatized form (e.g., "worked" → "work")
- phonetic: IPA pronunciation
- meaning: clear English definition
- example: natural example sentence
- sentenceIndex: which sentence (0-indexed) contains this in the article
- register: "casual" | "consultative" | "formal"
- nuance: "positive" | "slightly_positive" | "neutral" | "slightly_negative" | "negative"
- topic: relevant topic from list below (or "high_frequency" for common words)
- subtopic: more specific subtopic (or null)
- isHighFrequency: true if very common word (the, is, have, make, get, etc.)
- commonUsages: related expressions (max 3, empty [] if none)
  Each: {phrase, meaning, example, type: "collocation"|"phrasal_verb"|"idiom"|"expression"}
- words: component breakdown for multi-word phrases (empty [] for single words)
  Each: {word, meaning, partOfSpeech, isHighFrequency}

AVAILABLE TOPICS:
${topicList}

If you need a new topic not in the list, include isNewTopic: true.

RESPONSE FORMAT (JSON only, no markdown):
{
  "sentences": [
    {"en": "The company made a good profit.", "vi": "Công ty đã thu được lợi nhuận tốt."}
  ],
  "phrases": [
    {"phrase": "the", "baseForm": "the", "phonetic": "/ðə/", "meaning": "definite article", "sentenceIndex": 0, "register": "neutral", "nuance": "neutral", "topic": "high_frequency", "isHighFrequency": true, "commonUsages": [], "words": []},
    {"phrase": "company", "baseForm": "company", "phonetic": "/ˈkʌmpəni/", "meaning": "a business organization", "sentenceIndex": 0, "register": "consultative", "nuance": "neutral", "topic": "business", "subtopic": "organizations", "isHighFrequency": false, "commonUsages": [{"phrase": "run a company", "meaning": "to manage", "example": "She runs a tech company.", "type": "collocation"}], "words": []},
    {"phrase": "make a profit", "baseForm": "make profit", "phonetic": "/meɪk ə ˈprɒfɪt/", "meaning": "to earn money after costs", "sentenceIndex": 0, "register": "consultative", "nuance": "positive", "topic": "finance", "subtopic": "profits", "isHighFrequency": false, "commonUsages": [], "words": [{"word": "make", "meaning": "to produce", "partOfSpeech": "verb", "isHighFrequency": true}, {"word": "profit", "meaning": "money gained", "partOfSpeech": "noun", "isHighFrequency": false}]}
  ]
}`;
}
