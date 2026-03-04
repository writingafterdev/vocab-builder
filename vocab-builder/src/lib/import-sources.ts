/**
 * Shared import logic for automated article pipeline.
 * Extracted from admin/import-rss and admin/import-reddit routes.
 */

import { setDocument, getDocument, updateDocument, queryCollection, serverTimestamp } from '@/lib/firestore-rest';
import { createHash } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────

export interface ImportSource {
    id: string;
    type: 'rss' | 'reddit';
    url?: string;
    subreddit?: string;
    sort?: 'hot' | 'top' | 'new' | 'rising';
    time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    topic: string;
    enabled: boolean;
    articlesPerRun: number;
    lastImportedAt?: string;
    lastArticleCount?: number;
}

export interface ImportedArticle {
    id: string;
    title: string;
    content: string;
    source: string;
    coverImage?: string;
    isNew: boolean; // false if it already existed
}

export interface PipelineResult {
    postId: string;
    steps: Record<string, 'success' | 'failed' | 'skipped'>;
}

// ─── Default Sources ─────────────────────────────────────────────────

export const DEFAULT_SOURCES: Omit<ImportSource, 'id'>[] = [
    // Technology
    { type: 'rss', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', topic: 'technology', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://www.theverge.com/rss/index.xml', topic: 'technology', enabled: true, articlesPerRun: 5 },
    { type: 'reddit', subreddit: 'technology', sort: 'top', time: 'week', topic: 'technology', enabled: true, articlesPerRun: 3 },

    // Science
    { type: 'rss', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', topic: 'science', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://nautil.us/feed/', topic: 'science', enabled: true, articlesPerRun: 5 },
    { type: 'reddit', subreddit: 'science', sort: 'top', time: 'week', topic: 'science', enabled: true, articlesPerRun: 3 },

    // Business
    { type: 'rss', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', topic: 'business', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://feeds.hbr.org/harvardbusiness', topic: 'business', enabled: true, articlesPerRun: 5 },

    // Culture
    { type: 'rss', url: 'https://aeon.co/feed.rss', topic: 'culture', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://theconversation.com/us/articles.atom', topic: 'culture', enabled: true, articlesPerRun: 5 },
    { type: 'reddit', subreddit: 'TrueReddit', sort: 'top', time: 'week', topic: 'culture', enabled: true, articlesPerRun: 3 },

    // Health
    { type: 'rss', url: 'https://feeds.npr.org/1128/rss.xml', topic: 'health', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', topic: 'health', enabled: true, articlesPerRun: 5 },

    // World News
    { type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', topic: 'world', enabled: true, articlesPerRun: 5 },
    { type: 'rss', url: 'https://feeds.npr.org/1004/rss.xml', topic: 'world', enabled: true, articlesPerRun: 5 },
    { type: 'reddit', subreddit: 'worldnews', sort: 'top', time: 'week', topic: 'world', enabled: true, articlesPerRun: 3 },

    // Psychology
    { type: 'rss', url: 'https://aeon.co/psychology/feed.rss', topic: 'psychology', enabled: true, articlesPerRun: 5 },
    { type: 'reddit', subreddit: 'psychology', sort: 'top', time: 'week', topic: 'psychology', enabled: true, articlesPerRun: 3 },

    // Philosophy / Deep thinking
    { type: 'reddit', subreddit: 'philosophy', sort: 'top', time: 'week', topic: 'philosophy', enabled: true, articlesPerRun: 3 },
    { type: 'reddit', subreddit: 'Foodforthought', sort: 'top', time: 'week', topic: 'philosophy', enabled: true, articlesPerRun: 3 },

    // Substack (long-form essays)
    { type: 'rss', url: 'https://www.honest-broker.com/feed', topic: 'culture', enabled: true, articlesPerRun: 3 },
    { type: 'rss', url: 'https://www.noahpinion.blog/feed', topic: 'business', enabled: true, articlesPerRun: 3 },
    { type: 'rss', url: 'https://www.theintrinsicperspective.com/feed', topic: 'technology', enabled: true, articlesPerRun: 3 },
    { type: 'rss', url: 'https://www.construction-physics.com/feed', topic: 'science', enabled: true, articlesPerRun: 3 },
];

// ─── Paywall Detection ───────────────────────────────────────────────

function isPaywalledContent(content: string, title: string): boolean {
    const contentLower = content.toLowerCase();

    const indicators = [
        'this post is for paid subscribers',
        'this post is for paying subscribers',
        'upgrade to paid',
        'subscribe to continue reading',
        'continue reading with a subscription',
        'for paid subscribers only',
        'unlock this post',
        'become a paid subscriber',
        'this is a subscriber-only post',
        'member-only story',
        'read the full story with a free account',
        'become a member to read',
        'get unlimited access',
    ];

    for (const indicator of indicators) {
        if (contentLower.includes(indicator)) return true;
    }

    const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plainText.length < 500 && !title.toLowerCase().includes('announcement')) {
        return true;
    }

    return false;
}

// ─── RSS Import ──────────────────────────────────────────────────────

function extractCoverImage(item: any, content: string): string | undefined {
    if (item.enclosure?.url && item.enclosure?.type?.startsWith('image/')) return item.enclosure.url;
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;
    if (item.itunes?.image) return item.itunes.image;

    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1] && !imgMatch[1].startsWith('data:') && !imgMatch[1].includes('1x1')) {
        return imgMatch[1];
    }
    return undefined;
}

export async function importFromRSS(
    url: string,
    limit: number = 10,
    topic: string = 'general'
): Promise<ImportedArticle[]> {
    const { default: Parser } = await import('rss-parser');
    const parser = new Parser({
        customFields: {
            item: [
                ['media:content', 'media:content', { keepArray: false }],
                ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
                ['enclosure', 'enclosure', { keepArray: false }],
            ],
        },
    });

    let feed;
    try {
        feed = await parser.parseURL(url);
    } catch (error) {
        console.error(`[Import] Failed to parse RSS: ${url}`, error);
        return [];
    }

    if (!feed.items || feed.items.length === 0) return [];

    const sourceName = feed.title || new URL(url).hostname;
    const sourceId = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const imported: ImportedArticle[] = [];

    for (const item of feed.items.slice(0, limit)) {
        if (!item.title) continue;

        const content = (item as any)['content:encoded'] || item.content || item.contentSnippet || '';
        if (!content || isPaywalledContent(content, item.title)) continue;

        const link = item.link || '';
        const hash = createHash('md5').update(link || item.title).digest('hex');
        const postId = `rss_${sourceId}_${hash.slice(0, 20)}`;

        // Check if already exists
        const existing = await getDocument('posts', postId);
        if (existing) {
            imported.push({ id: postId, title: item.title, content, source: sourceName, isNew: false });
            continue;
        }

        const coverImage = extractCoverImage(item, content);

        await setDocument('posts', postId, {
            id: postId,
            authorId: 'rss',
            authorName: item.creator || (item as any).author || sourceName,
            authorUsername: `rss_${sourceId}`,
            source: sourceName,
            content,
            title: item.title,
            isArticle: true,
            type: 'admin',
            commentCount: 0,
            repostCount: 0,
            highlightedPhrases: [],
            originalUrl: link,
            createdAt: serverTimestamp(),
            coverImage,
            contentSource: 'rss',
            rssUrl: url,
            rssPubDate: item.pubDate,
            importTopic: topic,
            processingStatus: 'pending',
        } as unknown as Record<string, unknown>);

        imported.push({ id: postId, title: item.title, content, source: sourceName, coverImage, isNew: true });
    }

    return imported;
}

// ─── Reddit Import ───────────────────────────────────────────────────

export async function importFromReddit(
    subreddit: string,
    options: { sort?: string; time?: string; limit?: number; topic?: string } = {}
): Promise<ImportedArticle[]> {
    const { sort = 'top', time = 'week', limit = 10, topic = 'general' } = options;

    const { fetchSubredditPosts, fetchPostComments } = await import('@/lib/reddit');

    let posts;
    try {
        posts = await fetchSubredditPosts(subreddit, { sort, time, limit } as any);
    } catch (error) {
        console.error(`[Import] Failed to fetch r/${subreddit}:`, error);
        return [];
    }

    if (!posts || posts.length === 0) return [];

    const imported: ImportedArticle[] = [];

    for (const post of posts) {
        if (!post.title || !post.content) continue;

        const postId = `reddit_${subreddit}_${post.id}`;

        const existing = await getDocument('posts', postId);
        if (existing) {
            imported.push({ id: postId, title: post.title, content: post.content, source: `r/${subreddit}`, isNew: false });
            continue;
        }

        // Fetch comments
        let redditComments: any[] = [];
        try {
            const comments = await fetchPostComments(subreddit, post.id, { limit: 15, depth: 3 });
            redditComments = comments.map((c: any) => convertComment(c));
        } catch { /* comments optional */ }

        await setDocument('posts', postId, {
            id: postId,
            authorId: 'reddit',
            authorName: post.author,
            authorUsername: `u/${post.author}`,
            source: `r/${subreddit}`,
            content: post.content,
            title: post.title,
            isArticle: true,
            type: 'admin',
            commentCount: 0,
            repostCount: 0,
            highlightedPhrases: [],
            originalUrl: post.permalink,
            createdAt: serverTimestamp(),
            contentSource: 'reddit',
            subreddit,
            redditUrl: post.permalink,
            redditComments,
            importTopic: topic,
            processingStatus: 'pending',
        } as unknown as Record<string, unknown>);

        imported.push({ id: postId, title: post.title, content: post.content, source: `r/${subreddit}`, isNew: true });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    return imported;
}

function convertComment(comment: any): any {
    return {
        id: comment.id,
        author: comment.author,
        body: comment.body,
        upvotes: comment.upvotes,
        createdAt: comment.createdAt,
        children: (comment.children || []).map((c: any) => convertComment(c)),
    };
}

// ─── AI Processing Pipeline ─────────────────────────────────────────

const ADMIN_EMAIL = (process.env.ADMIN_EMAILS || '').split(',')[0]?.trim() || 'admin@system';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

/**
 * Call an internal API endpoint (server-to-server).
 */
async function callInternalAPI(
    path: string,
    body: Record<string, unknown>
): Promise<{ ok: boolean; data?: any }> {
    try {
        const url = `${APP_URL}${path}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': ADMIN_EMAIL,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            console.error(`[Pipeline] ${path} failed: ${res.status}`);
            return { ok: false };
        }

        const data = await res.json();
        return { ok: true, data };
    } catch (error) {
        console.error(`[Pipeline] ${path} error:`, error);
        return { ok: false };
    }
}

/**
 * Run the full AI processing pipeline on a single article.
 * Each step saves its results directly to Firestore.
 * Steps are independent — if one fails, others still run.
 */
export async function processArticlePipeline(
    postId: string,
    title: string,
    content: string
): Promise<PipelineResult> {
    const steps: Record<string, 'success' | 'failed' | 'skipped'> = {};

    // Mark as processing
    await updateDocument('posts', postId, { processingStatus: 'processing' });

    // 1. Extract phrases (DeepSeek) → highlightedPhrases
    const extractResult = await callInternalAPI('/api/admin/extract-phrases', { content, title });
    if (extractResult.ok && extractResult.data?.phrases?.length > 0) {
        await updateDocument('posts', postId, { highlightedPhrases: extractResult.data.phrases });
        steps.extractPhrases = 'success';
    } else {
        steps.extractPhrases = 'failed';
    }

    // 2. Process article (Gemini) → phraseData, detectedTopic
    const processResult = await callInternalAPI('/api/admin/process-article', { content, title });
    if (processResult.ok && processResult.data?.phrases) {
        await updateDocument('posts', postId, {
            phraseData: processResult.data.phrases,
            detectedTopic: processResult.data.detectedTopic,
        });
        steps.processArticle = 'success';
    } else {
        steps.processArticle = 'failed';
    }

    // 3. Topic vocab + lexile (Gemini) → topicVocab, lexileLevel
    const detectedTopic = processResult.data?.detectedTopic || 'General';
    const vocabResult = await callInternalAPI('/api/admin/extract-topic-vocab', {
        content, title, detectedTopic,
    });
    if (vocabResult.ok && vocabResult.data?.topicVocab) {
        const updates: Record<string, unknown> = { topicVocab: vocabResult.data.topicVocab };
        if (vocabResult.data.lexile) {
            updates.lexileLevel = vocabResult.data.lexile.level;
            updates.lexileScore = vocabResult.data.lexile.score;
        }
        await updateDocument('posts', postId, updates);
        steps.topicVocab = 'success';
    } else {
        steps.topicVocab = 'failed';
    }

    // 4. Generate sections (Gemini) → sections, subtitle
    const sectionsResult = await callInternalAPI('/api/admin/generate-sections', {
        postId, title, content,
    });
    if (sectionsResult.ok && sectionsResult.data?.sections) {
        // generate-sections already saves to Firestore via updateDocument
        steps.sections = 'success';
    } else {
        steps.sections = 'failed';
    }

    // 5. Generate audio (Gemini TTS) → audioUrl
    const audioResult = await callInternalAPI('/api/admin/generate-article-audio', {
        content, title,
    });
    if (audioResult.ok && audioResult.data?.audioBase64) {
        // Audio is returned as base64 — store as data URL for now
        // In production, upload to storage
        const mimeType = audioResult.data.mimeType || 'audio/wav';
        await updateDocument('posts', postId, {
            audioBase64: audioResult.data.audioBase64.slice(0, 100), // Don't store full base64 in Firestore
            hasAudio: true,
        });
        steps.audio = 'success';
    } else {
        steps.audio = 'failed';
    }

    // Mark as completed
    await updateDocument('posts', postId, {
        processingStatus: 'completed',
        processedAt: serverTimestamp(),
    });

    return { postId, steps };
}

// ─── Source Management ───────────────────────────────────────────────

/**
 * Get all enabled import sources from Firestore.
 */
export async function getEnabledSources(): Promise<ImportSource[]> {
    const docs = await queryCollection('importSources', {
        where: [{ field: 'enabled', op: '==', value: true }],
    });

    return docs.map(doc => ({
        id: doc.id as string,
        type: doc.type as 'rss' | 'reddit',
        url: doc.url as string | undefined,
        subreddit: doc.subreddit as string | undefined,
        sort: doc.sort as any,
        time: doc.time as any,
        topic: doc.topic as string,
        enabled: true,
        articlesPerRun: (doc.articlesPerRun as number) || 5,
        lastImportedAt: doc.lastImportedAt as string | undefined,
        lastArticleCount: doc.lastArticleCount as number | undefined,
    }));
}

/**
 * Seed default sources into Firestore (idempotent).
 */
export async function seedDefaultSources(): Promise<number> {
    let seeded = 0;

    for (const source of DEFAULT_SOURCES) {
        const id = source.type === 'rss'
            ? `rss_${createHash('md5').update(source.url!).digest('hex').slice(0, 12)}`
            : `reddit_${source.subreddit}`;

        const existing = await getDocument('importSources', id);
        if (existing) continue;

        await setDocument('importSources', id, {
            ...source,
            id,
        } as unknown as Record<string, unknown>);
        seeded++;
    }

    return seeded;
}
