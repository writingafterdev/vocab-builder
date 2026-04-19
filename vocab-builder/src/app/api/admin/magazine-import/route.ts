import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { setDocument, safeDocId, serverTimestamp } from '@/lib/appwrite/database';
import { writeFile, unlink } from 'fs/promises';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

// ── Job Store ─────────────────────────────────────────────────────────────────

export interface MagazineJob {
    id: string;
    status: 'queued' | 'extracting-text' | 'discovering' | 'processing' | 'saving' | 'done' | 'error';
    progress: { current: number; total: number; currentTitle?: string };
    result?: { count: number; articles: { title: string; detectedTopic: string; sections: number }[] };
    error?: string;
    createdAt: number;
}

const jobStore = new Map<string, MagazineJob>();

export function getJob(id: string) { return jobStore.get(id); }

function updateJob(id: string, patch: Partial<MagazineJob>) {
    const j = jobStore.get(id);
    if (j) jobStore.set(id, { ...j, ...patch });
}

setInterval(() => {
    const cutoff = Date.now() - 3_600_000;
    for (const [id, job] of jobStore) if (job.createdAt < cutoff) jobStore.delete(id);
}, 600_000);

// ── Guards ────────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
function isAdmin(email: string | null) {
    return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

// ── Step 1: Extract ALL text from PDF ────────────────────────────────────────
// Strategy:
//   1. Try pdftotext (poppler) — layout-aware, handles multi-column correctly
//   2. If not installed, auto-install via Homebrew (one-time, ~30s)
//   3. If Homebrew unavailable, fall back to unpdf (column order may be imperfect)



function isPdftotextAvailable(): boolean {
    try { execSync('which pdftotext', { stdio: 'pipe' }); return true; }
    catch { return false; }
}

async function ensurePdftotext(): Promise<boolean> {
    if (isPdftotextAvailable()) return true;

    // Check if Homebrew is available
    try { execSync('which brew', { stdio: 'pipe' }); }
    catch { return false; } // No Homebrew — can't auto-install

    console.log('[Magazine] pdftotext not found. Installing poppler via Homebrew (one-time)…');
    try {
        await execAsync('brew install poppler', { timeout: 120_000 });
        console.log('[Magazine] poppler installed successfully.');
        return isPdftotextAvailable();
    } catch (err: any) {
        console.warn('[Magazine] brew install failed:', err?.message);
        return false;
    }
}

async function extractFullText(buffer: Buffer, tmpFilePath: string): Promise<{ fullText: string; pageCount: number }> {
    const hasPdftotext = await ensurePdftotext();

    if (hasPdftotext) {
        // -layout: preserves spatial layout (column order)
        // -nopgbrk: no form-feed between pages
        // -enc UTF-8: force UTF-8 output
        console.log('[Magazine] Using pdftotext (layout-aware column extraction)');
        const { stdout } = await execAsync(
            `pdftotext -layout -enc UTF-8 "${tmpFilePath}" -`,
            { maxBuffer: 50 * 1024 * 1024 }
        );
        // Get page count separately
        let pageCount = 0;
        try {
            const { stdout: info } = await execAsync(`pdfinfo "${tmpFilePath}" | grep Pages:`);
            pageCount = parseInt(info.replace(/Pages:\s*/, '').trim(), 10) || 0;
        } catch { pageCount = 0; }

        return { fullText: stdout, pageCount };
    }

    // Fallback: unpdf (no native deps, but column order may be imperfect)
    console.log('[Magazine] Falling back to unpdf (Homebrew not available)');
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return { fullText: text as string, pageCount: pdf.numPages };
}


// ── Step 2: Discover article anchors (one tiny LLM call) ─────────────────────
// Takes the SAME fullText that extractFullText produced, so startSnippets are
// guaranteed to be findable via indexOf in Step 3.

interface ArticleAnchor {
    title: string;
    startSnippet: string; // verbatim words from fullText body text
    detectedTopic: string;
}

async function discoverAnchors(
    fullText: string,
    ai: GoogleGenAI
): Promise<ArticleAnchor[]> {
    // pdftotext uses \f (form-feed) as page separator; split on that.
    // For unpdf fallback, pages are already separated by double newlines.
    const pages = fullText
        .split(/\f/)
        .map(p => p.trim())
        .filter(p => p.length > 30);

    // Send only the first ~300 chars per page to keep the prompt small
    const compressed = pages
        .map((t, i) => `[P${i + 1}]: ${t.slice(0, 300).replace(/\s+/g, ' ')}`)
        .join('\n');

    const prompt = `You are a magazine editor. Below are the first few words of each page of a magazine PDF.

For each distinct editorial article you can identify (skip ads, subscription boxes, letters to editor, short blurbs < 300 words):
1. Write its exact headline/title
2. Write the first 20–25 words of the BODY text as they appear verbatim — NOT the title or byline, the actual first sentence of the article body
3. Classify the topic

CRITICAL: The "startSnippet" must be copied verbatim from the page previews above so it can be found programmatically.

Output ONLY a JSON array — no explanation:
[
  {
    "title": "Exact Article Headline",
    "startSnippet": "verbatim first twenty or so words of the body text",
    "detectedTopic": "One of: Technology, Science, Culture, Business, Psychology, World, Philosophy, Health"
  }
]

PAGE PREVIEWS:
${compressed}`;

    const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.1, responseMimeType: 'application/json' },
    }));

    const raw = (response.text ?? '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    console.log(`[Magazine] Discovery raw response (first 500 chars): ${raw.slice(0, 500)}`);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        const articles = (Array.isArray(parsed) ? parsed : []).filter((a: any) =>
            a.title && a.startSnippet && a.startSnippet.length > 15
        );
        console.log(`[Magazine] Discovery parsed ${articles.length} valid articles`);
        return articles;
    } catch (err) {
        console.error('[Magazine] Failed to parse discovery response:', raw.slice(0, 500));
        return [];
    }
}


// ── Step 3: Extract article text slices (zero AI, instant) ───────────────────
// For each anchor, find its startSnippet in the full text string.
// Then extract from that position to the next article's position.

interface ArticleSlice {
    title: string;
    detectedTopic: string;
    rawText: string;
}

function sliceArticleTexts(fullText: string, anchors: ArticleAnchor[]): ArticleSlice[] {
    // Find the position of each anchor's startSnippet in the full text
    const positions: { anchor: ArticleAnchor; pos: number }[] = [];

    // Normalize whitespace in fullText once for matching
    // (pdftotext -layout adds column-padding spaces; normalize for robust search)
    const normalizedText = fullText.replace(/[ \t]+/g, ' ');

    for (const anchor of anchors) {
        const normalizedSnippet = anchor.startSnippet.replace(/[ \t]+/g, ' ').trim();

        // 1. Try normalized exact match
        let pos = normalizedText.indexOf(normalizedSnippet);

        // 2. Try progressively shorter prefixes (first 8, 6, 4 words)
        if (pos === -1) {
            const words = normalizedSnippet.split(' ').filter(Boolean);
            for (const wordCount of [8, 6, 4]) {
                if (words.length <= wordCount) continue;
                const shortSnippet = words.slice(0, wordCount).join(' ');
                pos = normalizedText.indexOf(shortSnippet);
                if (pos !== -1) break;
            }
        }

        if (pos === -1) {
            console.warn(`[Magazine] Could not locate anchor for "${anchor.title}" — skipping`);
            console.warn(`  Snippet was: "${normalizedSnippet.slice(0, 80)}"`);
            continue;
        }
        positions.push({ anchor, pos });
        console.log(`[Magazine] ✓ Located "${anchor.title}" at position ${pos.toLocaleString()}`);
    }

    // Sort by position in the document (in case discovery returned out of order)
    positions.sort((a, b) => a.pos - b.pos);

    // Slice the full text between consecutive anchors
    const slices: ArticleSlice[] = [];
    for (let i = 0; i < positions.length; i++) {
        const start = positions[i].pos;
        const end = i + 1 < positions.length ? positions[i + 1].pos : fullText.length;
        const rawText = fullText.slice(start, end).trim();

        if (rawText.length < 200) {
            console.warn(`[Magazine] Article "${positions[i].anchor.title}" is too short — skipping`);
            continue;
        }

        slices.push({
            title: positions[i].anchor.title,
            detectedTopic: positions[i].anchor.detectedTopic,
            rawText,
        });
    }

    return slices;
}

// ── Step 4a: Deterministic text cleanup (no AI) ──────────────────────────────
// Fixes the most common PDF extraction artifacts with regex.

function formatContent(rawText: string): string {
    return rawText
        // Merge hyphenated line-breaks (e.g. "some-\nthing" → "something")
        .replace(/-\n([a-z])/g, '$1')
        // Collapse multiple spaces/tabs to single space
        .replace(/[ \t]{2,}/g, ' ')
        // Remove lone single-character lines (common column noise)
        .replace(/^\s*\S\s*$/gm, '')
        // Trim each line
        .split('\n').map(l => l.trim()).join('\n')
        // Collapse 3+ blank lines into 2
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Split cleaned text into sections of ~3 paragraphs each, wrapped in <p> tags. */
function buildSections(cleanedText: string): { content: string; vocabPhrases: string[] }[] {
    const paragraphs = cleanedText
        .split(/\n\n+/)
        .map(p => p.replace(/\n/g, ' ').trim())
        .filter(p => p.length > 40); // drop short noise lines

    const sections: { content: string; vocabPhrases: string[] }[] = [];
    const PARAS_PER_SECTION = 3;

    for (let i = 0; i < paragraphs.length; i += PARAS_PER_SECTION) {
        const chunk = paragraphs.slice(i, i + PARAS_PER_SECTION);
        const content = chunk.map(p => `<p>${p}</p>`).join('\n');
        sections.push({ content, vocabPhrases: [] });
    }

    return sections;
}

// ── Step 4b: AI metadata classification (tiny call, 3 fields only) ────────────

interface ArticleMeta {
    author: string;
    detectedTopic: string;
    lexile: { level: string; score: number };
}

async function classifyArticle(slice: ArticleSlice, ai: GoogleGenAI): Promise<ArticleMeta> {
    // Only send the first ~600 words — enough to detect author + tone
    const excerpt = slice.rawText.slice(0, 2500);

    const prompt = `Magazine article titled: "${slice.title}"

Excerpt:
---
${excerpt}
---

Return ONLY this JSON — no extra text:
{
  "author": "Author name from byline, or 'Unknown'",
  "detectedTopic": "One of: Technology, Science, Culture, Business, Psychology, World, Philosophy, Health",
  "lexile": { "level": "medium", "score": 1050 }
}

For lexile: level is one of "easy" (<800), "medium" (800-1100), "hard" (>1100). Score is a number.`;

    try {
        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { temperature: 0.1, responseMimeType: 'application/json' },
        }));

        const text = (response.text ?? '').replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        const raw = JSON.parse(text);
        return {
            author: raw.author || 'Unknown',
            detectedTopic: raw.detectedTopic || slice.detectedTopic,
            lexile: raw.lexile ?? { level: 'medium', score: 1050 },
        };
    } catch {
        return { author: 'Unknown', detectedTopic: slice.detectedTopic, lexile: { level: 'medium', score: 1050 } };
    }
}

// ── Step 4: Process one article slice ────────────────────────────────────────

async function processArticleSlice(slice: ArticleSlice, ai: GoogleGenAI): Promise<any | null> {
    try {
        // Run both in parallel — text formatting is instant, classification is async
        const [meta, sections] = await Promise.all([
            classifyArticle(slice, ai),
            Promise.resolve(buildSections(formatContent(slice.rawText))),
        ]);

        if (sections.length === 0) return null;

        return {
            title: slice.title,
            subtitle: '',
            author: meta.author,
            detectedTopic: meta.detectedTopic,
            lexile: meta.lexile,
            sections,
            content: sections.map(s => s.content).join('\n\n').slice(0, 9900),
        };
    } catch (err: any) {
        console.error(`[Magazine] Failed to process "${slice.title}":`, err?.message ?? err);
        return null;
    }
}




// ── Helpers ───────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try { return await fn(); } catch (err: any) {
            lastError = err;
            const isTransient =
                err?.status === 503 || err?.status === 429 ||
                String(err?.message).includes('fetch failed') ||
                String(err?.message).includes('UNAVAILABLE');
            if (!isTransient || attempt === maxAttempts) throw err;
            const delay = Math.min(1000 * 2 ** attempt, 16000);
            console.log(`[Magazine] Retry ${attempt}/${maxAttempts} in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

async function runParallel<T, R>(
    items: T[], fn: (item: T) => Promise<R>, concurrency = 3
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const settled = await Promise.allSettled(items.slice(i, i + concurrency).map(fn));
        results.push(...settled);
    }
    return results;
}

// ── Background processor ──────────────────────────────────────────────────────

async function processJob(
    jobId: string,
    buffer: Buffer,
    fileName: string,
    topic: string,
    ai: GoogleGenAI,
    tmpFilePath: string
) {
    try {
        // 1. Extract full text (deterministic, no AI)
        updateJob(jobId, { status: 'extracting-text', progress: { current: 0, total: 0 } });
        console.log(`[Job ${jobId}] Extracting full text…`);
        const { fullText, pageCount } = await extractFullText(buffer, tmpFilePath);
        console.log(`[Job ${jobId}] Got ${fullText.length.toLocaleString()} chars from ${pageCount} pages`);

        // 2. Discover anchors (one tiny LLM call)
        updateJob(jobId, { status: 'discovering', progress: { current: 0, total: 0 } });
        console.log(`[Job ${jobId}] Discovering article anchors…`);
        const anchors = await discoverAnchors(fullText, ai);
        console.log(`[Job ${jobId}] Found ${anchors.length} articles: ${anchors.map(a => `"${a.title}"`).join(', ')}`);

        if (anchors.length === 0) throw new Error('No articles identified. Check the file.');

        // 3. Slice article texts (zero AI — just string indexOf)
        const slices = sliceArticleTexts(fullText, anchors);
        console.log(`[Job ${jobId}] Successfully located ${slices.length}/${anchors.length} articles in text`);

        if (slices.length === 0) throw new Error('Could not locate any articles in the extracted text.');

        // 4. Clean each article slice with AI (parallel)
        updateJob(jobId, { status: 'processing', progress: { current: 0, total: slices.length } });
        let completed = 0;
        const cleanedArticles: any[] = [];

        const settled = await runParallel(
            slices,
            async (slice) => {
                updateJob(jobId, {
                    progress: { current: completed, total: slices.length, currentTitle: slice.title },
                });
                const result = await processArticleSlice(slice, ai);
                completed++;
                updateJob(jobId, { progress: { current: completed, total: slices.length } });
                return result;
            },
            3
        );

        for (const r of settled) {
            if (r.status === 'fulfilled' && r.value) cleanedArticles.push(r.value);
        }

        // 5. Save to database
        updateJob(jobId, { status: 'saving', progress: { current: cleanedArticles.length, total: cleanedArticles.length } });
        const savedIds: string[] = [];

        for (const article of cleanedArticles) {
            const sections: any[] = Array.isArray(article.sections) ? article.sections : [];
            if (!sections.length) continue;
            const postId = safeDocId('mag_' + uuidv4().slice(0, 10));
            await setDocument('posts', postId, {
                id: postId,
                title: article.title || fileName,
                subtitle: article.subtitle || '',
                content: sections.map((s: any) => s.content ?? '').join('\n\n').slice(0, 9900),
                sections,
                authorId: 'magazine_import',
                authorName: article.author || 'Unknown',
                authorUsername: 'magazine_import',
                source: fileName,
                isArticle: true,
                type: 'admin',
                commentCount: 0,
                repostCount: 0,
                createdAt: serverTimestamp(),
                contentSource: 'magazine',
                detectedTopic: article.detectedTopic || topic,
                lexileLevel: article.lexile?.level || 'medium',
                lexileScore: article.lexile?.score || 1050,
                processingStatus: 'completed',
            });
            savedIds.push(postId);
        }

        updateJob(jobId, {
            status: 'done',
            result: {
                count: savedIds.length,
                articles: cleanedArticles.map(a => ({
                    title: a.title,
                    detectedTopic: a.detectedTopic,
                    sections: a.sections?.length ?? 0,
                })),
            },
        });

        console.log(`[Job ${jobId}] ✓ Done — saved ${savedIds.length} articles`);
    } catch (err: any) {
        console.error(`[Job ${jobId}] Error:`, err?.message ?? err);
        updateJob(jobId, { status: 'error', error: err?.message || 'Unknown error' });
    } finally {
        await unlink(tmpFilePath).catch(() => {});
    }
}

// ── POST — start job ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const email = request.headers.get('x-user-email')?.toLowerCase() || null;
    if (!isAdmin(email)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const apiKey = (formData.get('apiKey') as string | null)?.trim();
    const topic = (formData.get('topic') as string) || 'General';

    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'Gemini API Key is required.' }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey });
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tmpFilePath = join(tmpdir(), uuidv4() + '-' + file.name);
    await writeFile(tmpFilePath, buffer);

    const jobId = uuidv4();
    jobStore.set(jobId, { id: jobId, status: 'queued', progress: { current: 0, total: 0 }, createdAt: Date.now() });

    // Fire and forget
    processJob(jobId, buffer, file.name, topic, ai, tmpFilePath).catch(() => {});

    return NextResponse.json({ jobId }, { status: 202 });
}

// ── GET — poll status ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const email = request.headers.get('x-user-email')?.toLowerCase() || null;
    if (!isAdmin(email)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId required.' }, { status: 400 });

    const job = jobStore.get(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

    return NextResponse.json(job);
}
