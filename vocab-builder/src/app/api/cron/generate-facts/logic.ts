import { getGrokKey } from '@/lib/grok-client';
import { GENERATE_FACTS_PROMPT } from '@/lib/prompts/fact-prompts';
import { addQuotesToBank } from '@/lib/db/quote-feed';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';

const TOPIC_POOL = [
    'History', 'Biology', 'Psychology', 'Space Exploration', 'Linguistics', 
    'Economics', 'Ancient Civilizations', 'Sociology', 'Artificial Intelligence', 
    'Neuroscience', 'Philosophy', 'Physics', 'Geography', 'Anthropology', 
    'Astronomy', 'Chemistry', 'Political Science', 'Classic Literature', 
    'Art History', 'Architecture', 'Greek Mythology', 'Evolution', 'Ecology', 
    'Geology', 'Mathematics', 'Music Theory', 'Medicine', 'Oceanography', 
    'Paleontology', 'Robotics', 'Quantum Mechanics', 'Cryptography', 
    'Genetics', 'Botany', 'Meteorology', 'Zoology', 'Cultural Studies', 
    'Ethics', 'Theology', 'Cinematography', 'Criminology', 'Culinary Arts', 
    'Fashion History', 'Sports Science', 'Urban Planning', 'Folklore', 'Cryptocurrency'
];

function pickRandom<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
}

export async function runGenerateFactsLogic() {
    const apiKey = getGrokKey('articles');
    if (!apiKey) {
        throw new Error('No Grok API key configured');
    }

    const numTopics = Math.floor(Math.random() * 4) + 5; // 5, 6, 7, or 8
    const selectedTopics = pickRandom(TOPIC_POOL, numTopics);
    console.log(`[FactGen] Generating facts for topics: ${selectedTopics.join(', ')}`);

    const prompt = GENERATE_FACTS_PROMPT.replace('{TOPICS}', selectedTopics.map(t => `- ${t}`).join('\n'));

    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500,
            temperature: 0.6,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[FactGen] Grok API error:', response.status, errorText);
        throw new Error('Grok API error');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let generatedFacts: any[] = [];
    try {
        generatedFacts = JSON.parse(cleaned);
    } catch (e) {
        console.error('[FactGen] Failed to parse JSON from Grok:', cleaned);
        throw new Error('JSON parse error from LLM');
    }

    if (!Array.isArray(generatedFacts)) {
        throw new Error('Invalid output format from LLM');
    }

    const validFacts = generatedFacts.filter(f => f.text && f.topic);
    
    const quoteEntries = validFacts.map(fact => ({
        text: fact.text,
        postId: `generated_fact_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        postTitle: `Fascinating ${fact.topic} Fact`,
        author: fact.author || 'Vocab AI',
        source: 'Fact Generator',
        topic: fact.topic.toLowerCase(),
        highlightedPhrases: Array.isArray(fact.highlightedPhrases) ? fact.highlightedPhrases : [],
        tags: Array.isArray(fact.tags) ? fact.tags.map((t: string) => t.toLowerCase()) : [],
        sourceType: 'generated_fact' as const,
        createdAt: new Date().toISOString(),
    }));

    if (quoteEntries.length > 0) {
        await addQuotesToBank(quoteEntries);
        console.log(`[FactGen] Successfully generated and stored ${quoteEntries.length} new facts.`);
    }

    return {
        success: true,
        generatedCount: quoteEntries.length,
        topics: selectedTopics,
        facts: quoteEntries
    };
}
