import { NextRequest, NextResponse } from 'next/server';
import { getSourceDefinition } from '@/lib/source-catalog';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
function isAdmin(email: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase()) || email === 'ducanhcontactonfb@gmail.com';
}

const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'this_is_just_a_local_dummy_key';

export async function POST(request: NextRequest) {
    try {
        const email = request.headers.get('x-user-email')?.toLowerCase() || null;
        if (!isAdmin(email)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { urls, sourceId } = body;

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return NextResponse.json({ error: 'Missing or empty urls array' }, { status: 400 });
        }

        const sourceDef = getSourceDefinition(sourceId);
        if (!sourceDef) {
            return NextResponse.json({ error: `Unknown sourceId: ${sourceId}` }, { status: 400 });
        }

        const results = await Promise.all(urls.map(async (url: string) => {
            try {
                // 1. Construct the target URL (prepended with smry.ai if bypass needed)
                let targetUrl = url;
                if (sourceDef.needsBypass) {
                    const cleanUrl = url.replace(/^(https?:\/\/)/, '');
                    targetUrl = `https://smry.ai/${cleanUrl}`;
                }

                console.log(`[Raw Scrape] Hitting ${targetUrl}...`);

                // 2. Hit Firecrawl
                const fcResponse = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
                    },
                    body: JSON.stringify({
                        url: targetUrl,
                        formats: ['markdown'],
                        waitFor: 7000,
                    })
                });

                if (!fcResponse.ok) {
                    throw new Error(`Firecrawl error: ${await fcResponse.text()}`);
                }

                const fcData = await fcResponse.json();
                let markdown = fcData.data?.markdown || '';
                const title = fcData.data?.metadata?.title || 'Unknown Title';

                if (!markdown) {
                    throw new Error('No markdown extracted by Firecrawl');
                }

                return { url, title, markdown, status: 'success' };

            } catch (err) {
                console.error(`[Raw Scrape] Error processing ${url}:`, err);
                return { url, error: err instanceof Error ? err.message : 'Unknown error', status: 'error' };
            }
        }));

        const successCount = results.filter(r => r.status === 'success').length;

        return NextResponse.json({
            success: true,
            totalScraped: successCount,
            results
        });

    } catch (error) {
        console.error('Raw Scrape endpoint error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown server error' },
            { status: 500 }
        );
    }
}
