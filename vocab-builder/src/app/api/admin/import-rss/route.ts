import { NextRequest, NextResponse } from 'next/server';
// Dynamic import to avoid bundling rss-parser/xml2js/sax into the main worker
// import Parser from 'rss-parser';
import { setDocument, serverTimestamp } from '@/lib/appwrite/database';
import { createHash } from 'crypto';
import { extractQuotesAsync } from '@/lib/quote-extraction';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}

interface ImportRequest {
    url: string;
    limit?: number;
}

// Extended RSS item type with media fields
type RssItem = {
    title?: string;
    content?: string;
    'content:encoded'?: string;
    contentSnippet?: string;
    creator?: string;
    author?: string;
    link?: string;
    pubDate?: string;
    enclosure?: { url?: string; type?: string };
    'media:content'?: { $?: { url?: string } };
    'media:thumbnail'?: { $?: { url?: string } };
    itunes?: { image?: string };
};

/**
 * Extract cover image from RSS item
 * Checks multiple sources: enclosure, media:content, media:thumbnail, itunes:image, or first img in content
 */
function extractCoverImage(item: RssItem, content: string): string | undefined {
    // 1. Check enclosure (common for podcasts/images)
    if (item.enclosure?.url && item.enclosure?.type?.startsWith('image/')) {
        return item.enclosure.url;
    }

    // 2. Check media:content (Substack, news sites)
    if (item['media:content']?.$?.url) {
        return item['media:content'].$.url;
    }

    // 3. Check media:thumbnail
    if (item['media:thumbnail']?.$?.url) {
        return item['media:thumbnail'].$.url;
    }

    // 4. Check itunes:image (podcasts)
    if (item.itunes?.image) {
        return item.itunes.image;
    }

    // 5. Extract first <img> from content HTML
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
        // Skip tiny images (likely tracking pixels) or data URIs
        const src = imgMatch[1];
        if (!src.startsWith('data:') && !src.includes('1x1') && !src.includes('pixel')) {
            return src;
        }
    }

    // 6. Check for og:image style patterns in content
    const ogMatch = content.match(/og:image[^>]+content=["']([^"']+)["']/i);
    if (ogMatch?.[1]) {
        return ogMatch[1];
    }

    return undefined;
}

/**
 * Detect if content is paywalled (Substack, Medium, etc.)
 * Returns true if the content appears to be behind a paywall
 */
function isPaywalledContent(content: string, title: string): boolean {
    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();

    // Substack paywall indicators
    const substackPaywall = [
        'this post is for paid subscribers',
        'this post is for paying subscribers',
        'upgrade to paid',
        'subscribe to continue reading',
        'continue reading with a subscription',
        'for paid subscribers only',
        'unlock this post',
        'become a paid subscriber',
        'this is a subscriber-only post',
    ];

    // Medium paywall indicators
    const mediumPaywall = [
        'member-only story',
        'read the full story with a free account',
        'become a member to read',
        'get unlimited access',
        'open in app',
        'read more with a free account',
    ];

    // Check all indicators
    const allIndicators = [...substackPaywall, ...mediumPaywall];
    for (const indicator of allIndicators) {
        if (contentLower.includes(indicator)) {
            return true;
        }
    }

    // Check if content is suspiciously short (likely truncated by paywall)
    // Clean HTML first
    const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plainText.length < 500 && !titleLower.includes('announcement')) {
        // Very short content that's not an announcement is likely paywalled
        return true;
    }

    return false;
}

/**
 * Import articles from an RSS feed
 * Admin-only endpoint
 */
export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;

        if (!isAdmin(email)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body: ImportRequest = await request.json();
        const { url, limit = 10 } = body;

        if (!url) {
            return NextResponse.json(
                { error: 'RSS URL is required' },
                { status: 400 }
            );
        }

        console.log(`Fetching RSS feed from ${url}...`);

        // Dynamic import to avoid bundling rss-parser + xml2js + sax into the main worker
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
            console.error('Error parsing RSS feed:', error);
            return NextResponse.json(
                { error: 'Failed to parse RSS feed. Please check the URL.' },
                { status: 400 }
            );
        }

        if (!feed.items || feed.items.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No items found in feed',
                imported: 0,
                posts: [],
            });
        }

        const itemsToImport = feed.items.slice(0, limit);
        const importedPosts = [];

        // Determine source name from feed title or URL
        const sourceName = feed.title || new URL(url).hostname;
        const sourceId = sourceName.toLowerCase().replace(/[^a-z0-9]/g, '');

        for (const item of itemsToImport) {
            if (!item.title || (!item.content && !(item as any)['content:encoded'] && !item.contentSnippet)) {
                continue;
            }

            try {
                // Generate unique ID based on link or title
                const link = item.link || '';
                const uniqueStr = link || item.title;

                // Use MD5 hash to ensure uniqueness even if URLs share prefixes
                // and to keep IDs deterministic (avoiding duplicates on re-import)
                const hash = createHash('md5').update(uniqueStr).digest('hex');
                const postId = `rss_${sourceId}_${hash.slice(0, 20)}`;

                // Content preference: content:encoded > content > contentSnippet
                const content = (item as any)['content:encoded'] || item.content || item.contentSnippet || '';

                // Skip paywalled content
                if (isPaywalledContent(content, item.title || '')) {
                    console.log(`Skipping paywalled article: ${item.title?.slice(0, 50)}...`);
                    continue;
                }

                // Extract cover image from RSS item
                const coverImage = extractCoverImage(item as RssItem, content);

                const postDoc = {
                    id: postId,
                    authorId: 'rss',
                    authorName: item.creator || (item as any).author || sourceName,
                    authorUsername: `rss_${sourceId}`,
                    source: sourceName,
                    content: content,
                    title: item.title,
                    isArticle: true,
                    type: 'admin',
                    commentCount: 0,
                    repostCount: 0,
                    highlightedPhrases: [],
                    originalUrl: link,
                    createdAt: serverTimestamp(),

                    // Cover image extracted from feed
                    coverImage: coverImage,

                    // RSS specific
                    contentSource: 'rss',
                    rssUrl: url,
                    rssPubDate: item.pubDate,
                };

                await setDocument('posts', postId, postDoc as unknown as Record<string, unknown>);
                importedPosts.push({ id: postId, title: item.title, coverImage: coverImage });

                // Extract quotes in background (non-blocking)
                extractQuotesAsync(postId, content, item.title || 'Untitled');

                console.log(`Imported RSS item: ${item.title.slice(0, 50)}... (image: ${coverImage ? 'yes' : 'no'})`);

            } catch (error) {
                console.error(`Error importing RSS item ${item.title}:`, error);
            }
        }

        return NextResponse.json({
            success: true,
            source: sourceName,
            imported: importedPosts.length,
            posts: importedPosts,
        });

    } catch (error) {
        console.error('Import RSS error:', error);
        return NextResponse.json(
            { error: 'Failed to import from RSS' },
            { status: 500 }
        );
    }
}
