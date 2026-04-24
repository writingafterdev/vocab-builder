import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { SOURCE_CATALOG } from '@/lib/source-catalog';
import { queryCollection } from '@/lib/appwrite/database';
import { getAdminRequestContext } from '@/lib/admin-auth';

const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'this_is_just_a_local_dummy_key';

/**
 * Parse article links from an RSS/Atom XML string.
 * Handles both <link> elements and href attributes in Atom feeds.
 */
function parseRssLinks(xml: string): string[] {
    const found = new Set<string>();

    // Atom: <link href="https://..." rel="alternate" .../>
    const atomLinkRegex = /<link[^>]+href="(https?:\/\/[^"]+)"[^>]*rel="alternate"[^>]*\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = atomLinkRegex.exec(xml)) !== null) {
        found.add(m[1].split('?')[0]); // strip utm params
    }

    // Also try reversed attribute order: rel="alternate" before href
    const atomLinkRegex2 = /<link[^>]+rel="alternate"[^>]+href="(https?:\/\/[^"]+)"[^>]*\/?>/g;
    while ((m = atomLinkRegex2.exec(xml)) !== null) {
        found.add(m[1].split('?')[0]);
    }

    // RSS 2.0: <link>https://...</link> (between <item> tags, not the channel link)
    const rssLinkRegex = /<item[^>]*>[\s\S]*?<link>(https?:\/\/[^<]+)<\/link>/g;
    while ((m = rssLinkRegex.exec(xml)) !== null) {
        found.add(m[1].trim().split('?')[0]);
    }

    return Array.from(found).filter(url => url.length > 0);
}

/**
 * Infer the best RSS feed to use based on the rootUrl path.
 * e.g. if user pastes theatlantic.com/feed/channel/ideas/ → use 'ideas' feed
 * if user pastes a generic atlantic URL → use 'all' feed
 */
function inferRssFeed(rootUrl: string, rssFeeds: Record<string, string>): string {
    const lower = rootUrl.toLowerCase();
    for (const [key, feedUrl] of Object.entries(rssFeeds)) {
        if (key !== 'all' && (lower.includes(`/${key}`) || lower.includes(`channel/${key}`))) {
            return feedUrl;
        }
    }
    // If user pastes the RSS feed URL directly, use it as-is
    if (lower.includes('/feed/')) {
        return rootUrl;
    }
    return rssFeeds['all'];
}

export async function POST(request: NextRequest) {
    const admin = await getAdminRequestContext(request);
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { rootUrl, sourceId } = body;

        if (!rootUrl) {
            return NextResponse.json({ error: 'Missing rootUrl' }, { status: 400 });
        }

        const sourceDef = SOURCE_CATALOG.find(s => s.id === sourceId);
        console.log(`[Discover] Source: ${sourceId} | url: ${rootUrl}`);

        let links: string[] = [];
        let strategy = '';
        let feedUrl = '';

        // ── STRATEGY 1: RSS FEED (for paywalled sources like The Atlantic) ──
        if (sourceDef?.rssFeeds) {
            strategy = 'rss';
            feedUrl = inferRssFeed(rootUrl, sourceDef.rssFeeds);
            console.log(`[Discover] Using RSS feed: ${feedUrl}`);

            const rssRes = await fetch(feedUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocabBuilder/1.0)' },
                signal: AbortSignal.timeout(10000),
            });

            if (!rssRes.ok) {
                throw new Error(`RSS fetch failed: ${rssRes.status} ${rssRes.statusText}`);
            }

            const xml = await rssRes.text();
            links = parseRssLinks(xml);
            console.log(`[Discover] RSS yielded ${links.length} article links`);
        }
        // ── STRATEGY 3: SMRY.AI BYPASS (paywalled, no RSS) ──
        else if (sourceDef?.needsBypass) {
            strategy = 'bypass';
            const bypassUrl = `https://smry.ai/${rootUrl.replace(/^https?:\/\//, '')}`;
            console.log(`[Discover] Using smry.ai bypass: ${bypassUrl}`);

            const scrapeRes = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
                },
                body: JSON.stringify({ url: bypassUrl, formats: ['markdown'], waitFor: 5000 }),
            });

            if (!scrapeRes.ok) {
                throw new Error(`Bypass scrape failed: ${await scrapeRes.text()}`);
            }

            const scrapeData = await scrapeRes.json();
            const markdown: string = scrapeData?.data?.markdown || scrapeData?.markdown || '';
            const domain = new URL(rootUrl).hostname;

            // Extract all links to the same domain from markdown
            const found = new Set<string>();
            const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
            const bareUrlRegex = /https?:\/\/[^\s"'<>)]+/g;
            let m: RegExpExecArray | null;
            while ((m = mdLinkRegex.exec(markdown)) !== null) {
                if (m[2].includes(domain)) found.add(m[2].split('?')[0]);
            }
            while ((m = bareUrlRegex.exec(markdown)) !== null) {
                const url = m[0].replace(/[.,;!?]+$/, '');
                if (url.includes(domain)) found.add(url.split('?')[0]);
            }
            links = Array.from(found);
            console.log(`[Discover] Bypass extracted ${links.length} links`);
        }
        // ── STRATEGY 4: STANDARD FIRECRAWL /MAP ──
        else {
            strategy = 'firecrawl-map';
            console.log(`[Discover] Using Firecrawl /map on ${rootUrl}`);
            const mapRes = await fetch(`${FIRECRAWL_URL}/v1/map`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
                },
                body: JSON.stringify({ url: rootUrl }),
            });

            if (!mapRes.ok) {
                throw new Error(`Firecrawl map failed: ${await mapRes.text()}`);
            }

            const mapData = await mapRes.json();
            links = mapData.links || [];
        }

        // ── DEDUPLICATION CHECK ──
        // Check existing posts by originalUrl to avoid duplicate imports
        if (links.length > 0) {
            console.log(`[Discover] Checking ${links.length} discovered links for duplicates...`);
            try {
                // Chunk the queries to avoid 'in' clause limit (100 in Appwrite)
                const chunkSize = 50;
                const existingUrls = new Set<string>();
                
                for (let i = 0; i < links.length; i += chunkSize) {
                    const chunk = links.slice(i, i + chunkSize);
                    const existingPosts = await queryCollection('posts', [
                        Query.equal('originalUrl', chunk),
                    ]);

                    existingPosts.forEach((post) => {
                        if (typeof post.originalUrl === 'string') {
                            existingUrls.add(post.originalUrl);
                        }
                    });
                }
                
                const beforeCount = links.length;
                links = links.filter(url => !existingUrls.has(url));
                console.log(`[Discover] Removed ${beforeCount - links.length} duplicates. Returning ${links.length} new links.`);
            } catch (err) {
                console.error("[Discover] Duplicate check failed, returning all links:", err);
            }
        }

        return NextResponse.json({ success: true, links, strategy, feedUrl });

    } catch (error) {
        console.error('Discover error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error during discovery' },
            { status: 500 }
        );
    }
}
