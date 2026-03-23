import { NextRequest, NextResponse } from 'next/server';
import { getPersonalizedFeed } from '@/lib/db/quote-feed';
import { queryCollection, runQuery } from '@/lib/appwrite/database';

interface QuoteResponse {
    id: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    source: string;
    topic: string;
    highlightedPhrases: string[];
    sourceType?: 'article' | 'generated_session' | 'generated_fact';
    sessionId?: string;
}

export async function GET(request: NextRequest) {
    try {
        // Secure authentication
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch user's saved phrases for Passive Learning cross-pollination
        let userSavedPhrases: string[] = [];
        try {
            const phrases = await runQuery(
                'savedPhrases',
                [{ field: 'userId', op: 'EQUAL', value: userId }],
                200
            );
            userSavedPhrases = phrases.map(p => (p.phrase as string).toLowerCase().trim());
        } catch (e) {
            console.warn('[QuoteFeed] Failed to fetch saved phrases for boost', e);
        }

        const url = new URL(request.url);
        const explicitTopicsStr = url.searchParams.get('explicitTopics');
        const explicitTopics = explicitTopicsStr ? explicitTopicsStr.split(',') : undefined;

        // ─── Try personalized feed from quotes collection ───
        const feed = await getPersonalizedFeed(userId, userSavedPhrases, explicitTopics);

        // Check onboarding
        if (feed.needsOnboarding) {
            return NextResponse.json({
                quotes: [],
                needsOnboarding: true,
            });
        }

        // If we have enough quotes in the bank, use them
        if (feed.quotes.length >= 5) {
            const quotes: QuoteResponse[] = feed.quotes.map(q => ({
                id: q.id || `quote-${q.postId}-${Math.random().toString(36).slice(2, 8)}`,
                text: q.text,
                postId: q.postId,
                postTitle: q.postTitle,
                author: q.author,
                source: q.source,
                topic: q.topic,
                highlightedPhrases: q.highlightedPhrases || [],
                sourceType: q.sourceType,
                sessionId: q.sessionId,
            }));

            return NextResponse.json({ quotes, needsOnboarding: false });
        }

        // ─── Fallback: legacy behavior (extract from posts) ───
        // Used when quote bank is empty or too small
        console.warn('[QuoteFeed] Quote bank too small, falling back to post extraction');

        // Fetch generated session quotes (top priority)
        const generatedQuotes: QuoteResponse[] = [];
        try {
            const genQuoteDocs = await runQuery(
                'generatedQuotes',
                [
                    { field: 'userId', op: 'EQUAL', value: userId },
                    { field: 'isRead', op: 'EQUAL', value: false },
                ],
                6
            );

            for (const doc of (genQuoteDocs || [])) {
                generatedQuotes.push({
                    id: `gen-${doc.id || doc.sessionId}-${generatedQuotes.length}`,
                    text: (doc.text as string) || '',
                    postId: (doc.sessionId as string) || '',
                    postTitle: (doc.postTitle as string) || 'Practice Article',
                    author: 'VocabBuilder AI',
                    source: 'Practice Session',
                    topic: 'general',
                    highlightedPhrases: (doc.highlightedPhrases as string[]) || [],
                    sourceType: 'generated_session',
                    sessionId: (doc.sessionId as string) || '',
                });
            }
        } catch (genErr) {
            console.warn('Failed to fetch generated quotes (non-fatal):', genErr);
        }

        // Fetch regular article quotes
        const allPosts = await queryCollection('posts');
        const posts = allPosts.filter(post => {
            if (!post.generatedForUserId) return true;
            return post.generatedForUserId === userId;
        }).slice(0, 80);

        const articleQuotes: QuoteResponse[] = [];

        for (const post of posts) {
            const extractedQuotes = post.extractedQuotes as string[] | undefined;

            if (extractedQuotes && extractedQuotes.length > 0) {
                for (const quoteText of extractedQuotes) {
                    articleQuotes.push({
                        id: `quote-${post.id}-${articleQuotes.length}`,
                        text: quoteText,
                        postId: post.id as string,
                        postTitle: (post.title as string) || 'Untitled',
                        author: (post.authorName as string) || 'Unknown',
                        source: (post.source as string) || 'Article',
                        topic: (post.importTopic as string) || 'general',
                        highlightedPhrases: (post.highlightedPhrases as string[]) || [],
                        sourceType: 'article',
                    });
                }
            } else if (post.content) {
                // Fallback: extract first sentences from content
                const cleanContent = (post.content as string)
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&#\d+;/g, '')
                    .trim();

                const sentences = cleanContent.match(/[^.!?]*[.!?]/g) || [];
                let quoteText = '';
                for (const sentence of sentences.slice(0, 2)) {
                    if ((quoteText + sentence).length < 300) {
                        quoteText += sentence;
                    } else {
                        break;
                    }
                }

                if (quoteText.length > 50) {
                    articleQuotes.push({
                        id: `quote-${post.id}`,
                        text: quoteText.trim(),
                        postId: post.id as string,
                        postTitle: (post.title as string) || 'Untitled',
                        author: (post.authorName as string) || 'Unknown',
                        source: (post.source as string) || 'Article',
                        topic: (post.importTopic as string) || 'general',
                        highlightedPhrases: (post.highlightedPhrases as string[]) || [],
                        sourceType: 'article',
                    });
                }
            }
        }

        const shuffledArticle = articleQuotes.sort(() => Math.random() - 0.5).slice(0, 40);
        const combined = [...generatedQuotes, ...shuffledArticle].slice(0, 50);

        return NextResponse.json({ quotes: combined, needsOnboarding: false });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
    }
}
