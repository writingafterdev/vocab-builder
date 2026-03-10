import { NextRequest, NextResponse } from 'next/server';
import { queryCollection, runQuery } from '@/lib/firestore-rest';

interface StoredQuote {
    id: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    source: string;
    highlightedPhrases: string[];
    sourceType?: 'article' | 'generated_session';
    sessionId?: string;
}

export async function GET(request: NextRequest) {
    try {
        // Secure authentication - verify Firebase ID token
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Fallback to header-based auth
        let userId = authUser?.userId;

        if (!userId) {
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ─── 1. Fetch generated session quotes (top priority) ───
        const generatedQuotes: StoredQuote[] = [];
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
                    highlightedPhrases: (doc.highlightedPhrases as string[]) || [],
                    sourceType: 'generated_session',
                    sessionId: (doc.sessionId as string) || '',
                });
            }
        } catch (genErr) {
            console.warn('Failed to fetch generated quotes (non-fatal):', genErr);
        }

        // ─── 2. Fetch regular article quotes ───
        const allPosts = await queryCollection('posts');

        // Filter to user's posts (include public + user's generated posts)
        const posts = allPosts.filter(post => {
            // Show all non-AI posts (admin, user, rss)
            if (!post.generatedForUserId) return true;
            // Show AI posts only if they belong to current user
            return post.generatedForUserId === userId;
        }).slice(0, 20);

        const articleQuotes: StoredQuote[] = [];

        for (const post of posts) {
            // Prefer pre-extracted quotes from AI
            const extractedQuotes = post.extractedQuotes as string[] | undefined;

            if (extractedQuotes && extractedQuotes.length > 0) {
                // Use AI-extracted quotes
                for (const quoteText of extractedQuotes) {
                    articleQuotes.push({
                        id: `quote-${post.id}-${articleQuotes.length}`,
                        text: quoteText,
                        postId: post.id as string,
                        postTitle: (post.title as string) || 'Untitled',
                        author: (post.authorName as string) || 'Unknown',
                        source: (post.source as string) || 'Article',
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

                // Get first 2-3 sentences (up to 300 chars)
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
                        highlightedPhrases: (post.highlightedPhrases as string[]) || [],
                        sourceType: 'article',
                    });
                }
            }
        }

        // Shuffle article quotes and limit
        const shuffledArticle = articleQuotes.sort(() => Math.random() - 0.5).slice(0, 12);

        // Generated quotes go first, then shuffled article quotes
        const combined = [...generatedQuotes, ...shuffledArticle].slice(0, 15);

        return NextResponse.json({ quotes: combined });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
    }
}
