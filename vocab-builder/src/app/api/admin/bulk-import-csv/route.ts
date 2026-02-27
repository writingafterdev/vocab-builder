import { NextRequest, NextResponse } from 'next/server';
import { createArticle } from '@/lib/db/posts';
import type { SentencePair, ExtractedPhrase } from '@/lib/db/types';

/**
 * Bulk CSV Import API for Articles
 *
 * Accepts CSV with columns:
 * - title (required)
 * - content (required)
 * - coverImage
 * - originalUrl
 * - source
 * - phrases (comma-separated vocabulary words)
 * - sentences (JSON array of {en, vi} pairs)
 * - autoProcess ("true" to auto-extract vocab)
 */

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

interface CSVArticle {
    title: string;
    content: string;
    coverImage?: string;
    originalUrl?: string;
    source?: string;
    phrases?: string[];
    sentences?: SentencePair[];
    autoProcess?: boolean;
}

/**
 * Parse CSV string handling quoted fields with commas and newlines
 */
function parseCSV(csvText: string): Record<string, string>[] {
    const rows: Record<string, string>[] = [];
    const lines = csvText.trim();

    let currentField = '';
    let inQuotes = false;
    let fields: string[] = [];
    let headers: string[] = [];
    let isFirstRow = true;

    for (let i = 0; i < lines.length; i++) {
        const char = lines[i];
        const nextChar = lines[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote
                currentField += '"';
                i++;
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                fields.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                fields.push(currentField.trim());
                currentField = '';

                if (char === '\r') i++; // Skip \n

                if (isFirstRow) {
                    headers = fields.map(h => h.toLowerCase().replace(/['"]/g, ''));
                    isFirstRow = false;
                } else if (fields.some(f => f.length > 0)) {
                    const row: Record<string, string> = {};
                    headers.forEach((header, idx) => {
                        row[header] = fields[idx] || '';
                    });
                    rows.push(row);
                }
                fields = [];
            } else {
                currentField += char;
            }
        }
    }

    // Handle last row
    if (currentField.length > 0 || fields.length > 0) {
        fields.push(currentField.trim());
        if (!isFirstRow && fields.some(f => f.length > 0)) {
            const row: Record<string, string> = {};
            headers.forEach((header, idx) => {
                row[header] = fields[idx] || '';
            });
            rows.push(row);
        }
    }

    return rows;
}

/**
 * Parse a single CSV row into an article object
 */
function parseArticleRow(row: Record<string, string>): CSVArticle | null {
    const title = row['title']?.trim();
    const content = row['content']?.trim();

    if (!title || !content) {
        return null;
    }

    // Parse phrases (comma-separated)
    let phrases: string[] = [];
    const phrasesRaw = row['phrases']?.trim();
    if (phrasesRaw) {
        phrases = phrasesRaw.split(',').map(p => p.trim()).filter(Boolean);
    }

    // Parse sentences (JSON array)
    let sentences: SentencePair[] = [];
    const sentencesRaw = row['sentences']?.trim();
    if (sentencesRaw) {
        try {
            sentences = JSON.parse(sentencesRaw);
        } catch {
            console.warn('Failed to parse sentences JSON:', sentencesRaw);
        }
    }

    return {
        title,
        content,
        coverImage: row['coverimage'] || row['cover_image'] || row['image'] || undefined,
        originalUrl: row['originalurl'] || row['original_url'] || row['url'] || undefined,
        source: row['source'] || 'admin',
        phrases,
        sentences,
        autoProcess: row['autoprocess']?.toLowerCase() === 'true' || row['auto_process']?.toLowerCase() === 'true',
    };
}

export async function POST(request: NextRequest) {
    try {
        // Check admin authorization
        const userEmail = request.headers.get('x-user-email');
        if (userEmail !== ADMIN_EMAIL) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { csv, articles: articlesJson } = await request.json();

        let articles: CSVArticle[] = [];

        // Parse CSV if provided
        if (csv) {
            const rows = parseCSV(csv);
            articles = rows.map(parseArticleRow).filter((a): a is CSVArticle => a !== null);
        }
        // Or accept pre-parsed articles array
        else if (articlesJson && Array.isArray(articlesJson)) {
            articles = articlesJson;
        }

        if (articles.length === 0) {
            return NextResponse.json({ error: 'No valid articles found in CSV' }, { status: 400 });
        }

        const results: { success: number; errors: string[] } = {
            success: 0,
            errors: [],
        };

        // Process articles in sequence
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];

            try {
                const source = article.source || 'admin';

                // Build phrase data if phrases are provided
                let phraseData: ExtractedPhrase[] = [];
                if (article.phrases && article.phrases.length > 0) {
                    phraseData = article.phrases.map(phrase => ({
                        phrase,
                        meaning: '', // Can be filled in later
                        partOfSpeech: 'noun' as const,
                    }));
                }

                await createArticle({
                    title: article.title,
                    content: article.content,
                    coverImage: article.coverImage,
                    originalUrl: article.originalUrl,
                    highlightedPhrases: article.phrases || [],
                    phraseData: phraseData.length > 0 ? phraseData : undefined,
                    sentences: article.sentences,
                    authorName: source.charAt(0).toUpperCase() + source.slice(1),
                    authorUsername: source,
                    source,
                });

                results.success++;

                // TODO: If autoProcess is true, trigger vocabulary extraction
                // This could call the process-article endpoint or run inline

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                results.errors.push(`Row ${i + 1} (${article.title}): ${errorMsg}`);
            }
        }

        return NextResponse.json({
            message: `Imported ${results.success} of ${articles.length} articles`,
            ...results,
            total: articles.length,
        });

    } catch (error) {
        console.error('Bulk import error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 500 }
        );
    }
}
