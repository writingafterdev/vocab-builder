/**
 * AI-powered quote extraction from articles
 * Uses Grok (xAI) to identify the most impactful, quotable sentences
 * 
 * Extracts quotes AND writes them to the standalone `quotes` collection
 * with topic metadata for the feed algorithm.
 */

import { logTokenUsage } from '@/lib/db/token-tracking';
import { addQuotesToBank } from '@/lib/db/quote-feed';
import { updateDocument } from '@/lib/firestore-rest';

function getXaiApiKey() { return process.env.XAI_API_KEY; }
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Extract 3-5 impactful quotes from article content
 * @param content - Raw HTML content of the article
 * @param title - Article title for context
 * @returns Array of quote strings
 */
export async function extractQuotes(
    content: string,
    title: string,
    userId?: string,
    userEmail?: string
): Promise<string[]> {
    const apiKey = getXaiApiKey();
    if (!apiKey) {
        console.warn('XAI_API_KEY not set, skipping quote extraction');
        return [];
    }

    try {
        // Clean HTML and get plain text
        const plainText = content
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#\d+;/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 4000); // Limit to avoid token overflow

        const prompt = `Extract 3-5 of the most impactful, quotable sentences from this article.

ARTICLE TITLE: ${title}

ARTICLE CONTENT:
${plainText}

RULES:
1. Select complete sentences that stand alone well out of context
2. Prefer sentences that are insightful, surprising, or thought-provoking
3. Avoid generic statements or introductions
4. Each quote should be 15-50 words (not too short, not too long)
5. Preserve the exact wording from the article

Return ONLY a JSON array of quote strings, e.g.:
["Quote one here.", "Quote two here.", "Quote three here."]`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Grok API error:', response.status, errorText);
            return [];
        }

        const data = await response.json();

        // Log token usage
        if (data.usage && userId) {
            logTokenUsage({
                userId,
                userEmail: userEmail || '',
                endpoint: 'extract-quotes',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const text = data.choices?.[0]?.message?.content || '';

        // Parse JSON array from response
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const quotes = JSON.parse(cleaned);

        if (Array.isArray(quotes) && quotes.every(q => typeof q === 'string')) {
            return quotes.slice(0, 5); // Max 5 quotes
        }

        return [];
    } catch (error) {
        console.error('Quote extraction error:', error);
        return [];
    }
}

/**
 * Extract quotes AND save them to the quotes bank + post document
 * This is the primary entry point — runs synchronously within the pipeline
 * so it doesn't get killed by serverless function shutdown.
 * 
 * @param postId - The post document ID
 * @param content - Raw HTML content
 * @param title - Article title
 * @param topic - Topic from import source (e.g. 'technology', 'psychology')
 * @param author - Article author name
 * @param source - Article source name
 * @param userId - Optional user ID for token tracking
 */
export async function extractAndSaveQuotes(
    postId: string,
    content: string,
    title: string,
    topic: string,
    author: string = 'Unknown',
    source: string = 'Article',
    userId?: string,
): Promise<string[]> {
    const quotes = await extractQuotes(content, title, userId);
    
    if (quotes.length === 0) return [];

    try {
        // 1. Save to post document (backward compat)
        await updateDocument('posts', postId, {
            extractedQuotes: quotes,
        });

        // 2. Save each quote to the standalone `quotes` collection
        const quoteEntries = quotes.map(text => ({
            text,
            postId,
            postTitle: title,
            author,
            source,
            topic: topic || 'general',
            highlightedPhrases: [] as string[],
            sourceType: 'article' as const,
            createdAt: new Date().toISOString(),
        }));

        await addQuotesToBank(quoteEntries);
        console.log(`[QuoteExtraction] Saved ${quotes.length} quotes for post ${postId} (topic: ${topic})`);
    } catch (error) {
        console.error(`[QuoteExtraction] Failed to save quotes for ${postId}:`, error);
    }

    return quotes;
}

/**
 * @deprecated Use extractAndSaveQuotes instead (runs synchronously in pipeline)
 * This fire-and-forget version doesn't work on serverless platforms.
 */
export function extractQuotesAsync(
    postId: string,
    content: string,
    title: string,
    userId?: string
): void {
    // Fire and forget - runs in background
    extractQuotes(content, title, userId).then(async (quotes) => {
        if (quotes.length > 0) {
            try {
                const { updateDocument } = await import('@/lib/firestore-rest');
                await updateDocument('posts', postId, {
                    extractedQuotes: quotes,
                });
                console.log(`Extracted ${quotes.length} quotes for post ${postId}`);
            } catch (error) {
                console.error(`Failed to save quotes for post ${postId}:`, error);
            }
        }
    }).catch((error) => {
        console.error(`Quote extraction failed for post ${postId}:`, error);
    });
}
