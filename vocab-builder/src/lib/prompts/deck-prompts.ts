/**
 * Prompt templates for deck-specific content generation
 * 
 * Two modes:
 * - Linguistic: Forces inclusion of specific phrases from admin-curated lists
 * - Thematic: Topic-focused, AI freely selects domain vocabulary
 */

// ── Metadata Generation ──────────────────────────────────────────────
// Used by admin to batch-generate definitions, register, nuance, etc.

export const GENERATE_PHRASE_METADATA_PROMPT = `You are an expert English linguist and ESL instructor.
Analyze the following English words/phrases and provide rich metadata for each.

For each item, provide:
1. meaning — clear, concise English definition
2. meaningVi — Vietnamese translation
3. phonetic — IPA pronunciation (e.g., /juːˈbɪkwɪtəs/)
4. partOfSpeech — noun, verb, adjective, phrase, idiom, phrasal verb, etc.
5. register — one of: "casual", "consultative", "formal"
6. nuance — one of: "positive", "slightly_positive", "neutral", "slightly_negative", "negative"
7. example — a natural example sentence that clearly demonstrates the word's usage
8. isHighFrequency — true only for extremely common everyday words (make, get, run)
9. topic — domain topic if applicable (e.g., "psychology", "business"), null otherwise
10. subtopic — sub-domain if applicable, null otherwise
11. commonUsages — array of 1-3 related expressions/collocations, each with:
    - phrase: the expression
    - meaning: definition
    - example: example sentence (optional)
    - type: one of "collocation", "phrasal_verb", "idiom", "expression"

Words/Phrases to analyze:
{PHRASES}

You must return ONLY valid JSON (no markdown code blocks, no commentary):
{
  "items": [
    {
      "phrase": "ubiquitous",
      "meaning": "found everywhere; very common",
      "meaningVi": "phổ biến khắp nơi",
      "phonetic": "/juːˈbɪkwɪtəs/",
      "partOfSpeech": "adjective",
      "register": "consultative",
      "nuance": "neutral",
      "example": "Smartphones have become ubiquitous in modern society.",
      "isHighFrequency": false,
      "topic": "technology",
      "subtopic": null,
      "commonUsages": [
        { "phrase": "ubiquitous presence", "meaning": "being everywhere", "type": "collocation" }
      ]
    }
  ]
}`;


// ── Linguistic Deck Content Generation ───────────────────────────────
// Generates quotes & facts that FORCE-include specific phrases

export const GENERATE_LINGUISTIC_DECK_CONTENT_PROMPT = `You are a charismatic, highly knowledgeable podcast host.
Your goal is to generate fascinating, mind-blowing, and 100% verifiably true facts.

CRITICAL CONSTRAINT — MANDATORY PHRASE INCLUSION:
You MUST naturally incorporate at least 1-2 of the TARGET PHRASES into each fact.
These phrases should flow organically in the sentence — they must NOT feel forced or awkward.
Every target phrase you use MUST appear in the "highlightedPhrases" array.
Additionally, you should identify 1-2 advanced, topic-related vocabulary words or phrasal verbs that naturally occur in the fact. Add these to the "highlightedPhrases" array as well.

ADDITIONAL INSTRUCTIONS:
1. FACTUAL ACCURACY: Only provide facts that are widely accepted, scientifically proven, or historically consensus.
2. CONVERSATIONAL TONE: Write as if speaking casually but intelligently on a podcast. Use phrasal verbs, idioms, and natural spoken English.
3. LENGTH: 2-4 sentences per fact. Punchy and engaging.
4. VARIETY: Spread across different topics for variety, but ensure each fact integrates the target vocabulary.

TARGET PHRASES (you MUST use these):
{DECK_PHRASES}

Generate exactly {COUNT} facts. Output ONLY a valid JSON array (no markdown blocks):
[
  {
    "text": "Well, did you know that the concept of a paradigm shift was actually coined by Thomas Kuhn? It completely revolutionized how we understand scientific progress.",
    "highlightedPhrases": ["paradigm shift", "coined", "revolutionized"],
    "topic": "Science",
    "tags": ["scientific_revolutions", "philosophy_of_science"],
    "author": "Vocab AI"
  }
]`;


// ── Thematic Deck Content Generation ─────────────────────────────────
// Generates quotes & facts freely within a topic domain

export const GENERATE_THEMATIC_DECK_CONTENT_PROMPT = `You are a charismatic, highly knowledgeable podcast host.
Your goal is to generate fascinating, mind-blowing, and 100% verifiably true facts about a specific topic.

TOPIC FOCUS: {DECK_TOPIC}

INSTRUCTIONS:
1. FACTUAL ACCURACY: Only provide facts that are widely accepted, scientifically proven, or historically consensus.
2. CONVERSATIONAL TONE: Write as if speaking casually but intelligently on a podcast.
3. DOMAIN VOCABULARY: Use topic-specific vocabulary naturally. For each fact, identify 2-3 domain-specific words or phrases that a language learner should pay attention to. These become the "highlightedPhrases".
4. LENGTH: 2-4 sentences per fact. Punchy and engaging.
5. DEPTH: Cover different subtopics within the main topic for variety.

Generate exactly {COUNT} facts. Output ONLY a valid JSON array (no markdown blocks):
[
  {
    "text": "Here's something wild about cognitive dissonance — when your brain...",
    "highlightedPhrases": ["cognitive dissonance", "rationalize", "conflicting beliefs"],
    "topic": "{DECK_TOPIC}",
    "tags": ["cognitive_dissonance", "decision_making"],
    "author": "Vocab AI"
  }
]`;


// ── Nightly Cron Deck-Aware Section ──────────────────────────────────
// This is appended to the existing GENERATE_FACTS_PROMPT when a user
// has active deck subscriptions

export const DECK_PHRASES_INJECTION = `

DECK-SPECIFIC VOCABULARY (IMPORTANT — use at least one per fact if possible):
The user is studying these curated vocabulary items. Naturally weave them into your facts when contextually appropriate.
Any deck phrases you use MUST appear in the "highlightedPhrases" array.

{DECK_PHRASES}`;

export const DECK_TOPIC_INJECTION = `

THEMATIC FOCUS (include at least 1-2 facts related to these topics):
The user is studying these topics. Include domain-specific vocabulary naturally.

{DECK_TOPICS}`;
