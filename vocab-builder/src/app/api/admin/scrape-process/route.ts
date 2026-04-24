import { NextRequest, NextResponse } from 'next/server';
import { getSourceDefinition } from '@/lib/source-catalog';
import { createPostWithComments } from '@/lib/db/admin';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { getAdminRequestContext } from '@/lib/admin-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.AISTUDIO_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminRequestContext(request);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
        }

        const body = await request.json();
        // articles format: { url, title, markdown }
        const { articles, sourceId, section } = body;

        if (!articles || !Array.isArray(articles) || articles.length === 0) {
            return NextResponse.json({ error: 'Missing or empty articles array' }, { status: 400 });
        }

        const sourceDef = getSourceDefinition(sourceId);
        if (!sourceDef) {
            return NextResponse.json({ error: `Unknown sourceId: ${sourceId}` }, { status: 400 });
        }

        console.log(`[Process] Starting bulk AI batch submission for ${articles.length} articles...`);

        // Dynamically import to keep dependencies clean
        const { GoogleGenAI } = await import('@google/genai');
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // 1. Prepare JSONL for Batch
        const jsonlLines = articles.map((article: any, index: number) => {
            const prompt = `Convert the following markdown article into completely clean, semantic HTML.
You must return your output wrapped in a JSON object.
Extract the most appropriate title and convert the core body content into clean semantic HTML (using <p>, <h2>, <ul>, etc.). 
Skip/Remove any navigation, footer, irrelevant links, or advertisement markdown bits.

MARKDOWN TO PROCESS:
"""
${(article.markdown || '').substring(0, 40000)}
"""

You MUST return ONLY valid JSON in this exact format (no markdown formatting around the output, just raw JSON):
{
  "title": "${(article.title || '').replace(/"/g, '\\"')}",
  "contentHtml": "<p>First paragraph.</p><p>Second paragraph...</p>"
}`;
            return JSON.stringify({
                request_id: `article-${index}`,
                model: 'gemini-2.5-flash',
                request: {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json",
                    }
                }
            });
        });

        const jsonlContent = jsonlLines.join('\n');
        const tmpFilePath = path.join(os.tmpdir(), `gemini-batch-${Date.now()}.jsonl`);
        fs.writeFileSync(tmpFilePath, jsonlContent);

        console.log(`[Process] Uploading batch file to Gemini...`);
        const uploadedFile = await ai.files.upload({
           file: tmpFilePath,
           config: { mimeType: 'application/jsonl' },
        });

        console.log(`[Process] Starting Batch Job...`);
        const batchJob = await ai.batches.create({
           model: 'gemini-2.5-flash',
           src: { fileName: uploadedFile.name },
           config: { displayName: `Sync ${sourceDef.label} - ${Date.now()}` }
        });

        return NextResponse.json({
            success: true,
            batchId: batchJob.name,
            totalProcessed: articles.length,
            message: "Batch job successfully submitted."
        });

    } catch (error) {
        console.error('Process endpoint error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown server error' },
            { status: 500 }
        );
    }
}
