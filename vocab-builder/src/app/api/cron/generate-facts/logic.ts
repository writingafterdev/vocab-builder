import { getGrokKey } from '@/lib/grok-client';
import { GENERATE_FACTS_PROMPT } from '@/lib/prompts/fact-prompts';
import { addQuotesToBank } from '@/lib/db/quote-feed';
import { queryCollection } from '@/lib/appwrite/database';

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

/**
 * Salvage complete JSON objects from a truncated JSON array.
 * E.g. if the LLM output is `[{...}, {...}, {... (truncated)`,
 * this will recover the complete objects before the truncation point.
 */
function salvageTruncatedJSON(text: string): any[] {
    // Find the last complete object boundary (closing brace followed by comma or end)
    let lastGoodEnd = -1;
    let braceDepth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braceDepth++;
        if (ch === '}') {
            braceDepth--;
            if (braceDepth === 0) {
                lastGoodEnd = i;
            }
        }
    }

    if (lastGoodEnd === -1) return [];

    // Slice up to last complete object, close the array
    const salvaged = text.slice(0, lastGoodEnd + 1).trim();
    // Ensure it starts with [ and ends properly
    const arrayStr = salvaged.startsWith('[') ? salvaged + ']' : '[' + salvaged + ']';

    try {
        const result = JSON.parse(arrayStr);
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
}

export async function runGenerateFactsLogic() {
    const apiKey = getGrokKey('articles');
    if (!apiKey) {
        throw new Error('No Grok API key configured');
    }

    const nowStr = new Date().toISOString();
    let users: any[] = [];
    try {
        // Limit to 10 users per run to prevent scaling timeouts.
        users = await queryCollection('users', { limit: 10 });
        console.log(`[FactGen] Fetched ${users.length} active users.`);
    } catch (e) {
        console.error('[FactGen] Failed to fetch users', e);
        throw e;
    }

    let totalGeneratedCount = 0;
    const allGeneratedFacts: any[] = [];

    for (const user of users) {
        const userId = user.id;

        let userDuePhrases: string[] = [];
        try {
            const duePhrasesDocs = await queryCollection('savedPhrases', {
                where: [
                    { field: 'userId', op: '==', value: userId },
                    { field: 'nextReviewDate', op: '<=', value: nowStr }
                ],
                limit: 100
            });
            const phrases = duePhrasesDocs.map(d => (d.phrase as string)?.toLowerCase().trim()).filter(Boolean);
            const uniquePhrases = [...new Set(phrases)];
            // Pick up to 5 target phrases for their personalized prompt
            userDuePhrases = pickRandom(uniquePhrases, 5);
        } catch (e) {
            console.error(`[FactGen] Failed to fetch due phrases for user ${userId}`, e);
            continue;
        }

        // Only generate personalized facts if they have due phrases, otherwise skip
        // (to preserve API quota and prevent generating random facts per user endlessly)
        if (userDuePhrases.length === 0) {
            console.log(`[FactGen] Skipping user ${userId} - no due phrases today.`);
            continue;
        }

        console.log(`[FactGen] Generating facts for user ${userId} targeting ${userDuePhrases.length} phrases.`);

        const numTopics = Math.floor(Math.random() * 2) + 3;
        const selectedTopics = pickRandom(TOPIC_POOL, numTopics);

        let prompt = GENERATE_FACTS_PROMPT.replace('{TOPICS}', selectedTopics.map(t => `- ${t}`).join('\n'));
        prompt = prompt.replace('{TARGET_PHRASES}', userDuePhrases.map(p => `- ${p}`).join('\n'));

        try {
            const response = await fetch(XAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'grok-4-1-fast-non-reasoning',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 4000,
                    temperature: 0.6,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[FactGen] Grok API error for user ${userId}:`, response.status, errorText);
                continue;
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            let generatedFacts: any[] = [];
            try {
                generatedFacts = JSON.parse(cleaned);
            } catch (e) {
                generatedFacts = salvageTruncatedJSON(cleaned);
            }

            if (!Array.isArray(generatedFacts)) continue;

            const validFacts = generatedFacts.filter(f => f.text && f.topic);
            
            const quoteEntries = validFacts.map(fact => {
                let isCommunityPick = false;
                const textLower = fact.text.toLowerCase();
                for (const cp of userDuePhrases) {
                    if (textLower.includes(cp)) {
                        isCommunityPick = true;
                        break;
                    }
                }
                
                let author = fact.author || 'Vocab AI';
                const tags = Array.isArray(fact.tags) ? fact.tags.map((t: string) => t.toLowerCase()) : [];
                if (isCommunityPick) {
                    author = 'Vocab AI (Community Pick)';
                    if (!tags.includes('community_pick')) tags.push('community_pick');
                }

                return {
                    text: fact.text,
                    postId: `generated_fact_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                    postTitle: `Fascinating ${fact.topic} Fact`,
                    author,
                    source: 'Fact Generator',
                    topic: fact.topic.toLowerCase(),
                    highlightedPhrases: Array.isArray(fact.highlightedPhrases) ? fact.highlightedPhrases : [],
                    tags,
                    sourceType: 'generated_fact' as const,
                    createdAt: new Date().toISOString(),
                    userId: userId // Explicitly assign ownership to the user
                };
            });

            if (quoteEntries.length > 0) {
                await addQuotesToBank(quoteEntries);
                totalGeneratedCount += quoteEntries.length;
                allGeneratedFacts.push(...quoteEntries);
            }
        } catch (err) {
            console.error(`[FactGen] Error processing user ${userId}:`, err);
        }
    }

    // Platform Health check - if no users had due phrases, generate a generic fallback batch for the global feed
    if (totalGeneratedCount === 0) {
        console.log('[FactGen] No personalized facts generated. Creating 1 global fallback batch.');
        const numTopics = 3;
        const selectedTopics = pickRandom(TOPIC_POOL, numTopics);
        let prompt = GENERATE_FACTS_PROMPT.replace('{TOPICS}', selectedTopics.map(t => `- ${t}`).join('\n'));
        prompt = prompt.replace('{TARGET_PHRASES}', 'None provided.');

        try {
            const response = await fetch(XAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'grok-4-1-fast-non-reasoning',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 4000,
                    temperature: 0.6,
                }),
            });
            
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || '';
                const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                let generatedFacts: any[] = [];
                try {
                    generatedFacts = JSON.parse(cleaned);
                } catch (e) {
                    generatedFacts = salvageTruncatedJSON(cleaned);
                }

                if (Array.isArray(generatedFacts)) {
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
                        totalGeneratedCount += quoteEntries.length;
                        allGeneratedFacts.push(...quoteEntries);
                    }
                }
            }
        } catch (err) {
            console.error('[FactGen] Global fallback batch failed:', err);
        }
    }

    console.log(`[FactGen] Complete. Generated ${totalGeneratedCount} total facts.`);

    return {
        success: true,
        generatedCount: totalGeneratedCount,
        facts: allGeneratedFacts
    };
}
