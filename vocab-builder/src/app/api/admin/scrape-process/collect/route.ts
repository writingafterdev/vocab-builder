import { NextRequest, NextResponse } from 'next/server';
import { createPostWithComments } from '@/lib/db/admin';
import { getSourceDefinition } from '@/lib/source-catalog';
import { getAdminRequestContext } from '@/lib/admin-auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.AISTUDIO_API_KEY;

export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminRequestContext(request);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        // localUrlsMap links request_id to original metadata
        // e.g. { "article-0": { url, title, sourceId, section } }
        const { batchId, localUrlsMap } = body; 

        if (!batchId || !localUrlsMap) {
            return NextResponse.json({ error: 'Missing batchId or localUrlsMap' }, { status: 400 });
        }

        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const batchJob = await ai.batches.get({ name: batchId });
        
        if (batchJob.state !== 'JOB_STATE_SUCCEEDED' && batchJob.state !== 'JOB_STATE_FAILED' && batchJob.state !== 'JOB_STATE_PARTIALLY_SUCCEEDED') {
            return NextResponse.json({ error: `Job is currently ${batchJob.state}` }, { status: 400 });
        }

        // Output URI / output File
        const outputUri = batchJob.dest?.gcsUri || ''; 
        const outputFileName = batchJob.dest?.fileName || '';
        
        let rawJsonl = '';

        if (outputUri && outputUri.includes('generativelanguage.googleapis.com')) {
            // It's a standard REST url
            const resp = await fetch(`${outputUri}?key=${GEMINI_API_KEY}`);
            if (!resp.ok) throw new Error("Failed to download output URI");
            rawJsonl = await resp.text();
        } else if (ai.files && outputFileName) {
            // Using File API
            const fileData = await ai.files.get({ name: outputFileName });
            if (fileData.uri) {
                const resp = await fetch(fileData.uri);
                rawJsonl = await resp.text();
            } else {
                throw new Error("SDK file entity has no URI");
            }
        } else {
            // Manual fallback if SDK changes
            // Some versions of Gemini API return output as a 'file' entity, fetchable via REST
            // We'll attempt a direct fetch if outputUri is present.
            throw new Error(`Cannot parse output destination. outputUri: ${outputUri}, outputFile: ${outputFileName}`);
        }

        const lines = rawJsonl.split('\n').filter(Boolean);
        const results = [];
        let successCount = 0;

        for (const line of lines) {
            try {
                const row = JSON.parse(line);
                const reqId = row.request?.id || row.request_id || row.id;
                
                const meta = localUrlsMap[reqId];
                if (!meta) continue;

                const responseObj = row.response || row.candidate || row;
                const aiText = responseObj?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                if (!aiText) continue;

                let parsed;
                try {
                    parsed = JSON.parse(aiText.trim());
                } catch {
                    const cleaned = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    parsed = JSON.parse(cleaned);
                }

                const sourceDef = getSourceDefinition(meta.sourceId);
                const authorName = sourceDef ? sourceDef.label : 'Admin';

                const finalTitle = parsed.title || meta.title;
                const finalContent = parsed.contentHtml || '';

                if (finalContent) {
                    const postId = await createPostWithComments({
                        title: finalTitle,
                        content: finalContent,
                        isArticle: true,
                        authorName: authorName,
                        authorUsername: meta.sourceId,
                        sourceId: meta.sourceId,
                        section: meta.section || '',
                        originalUrl: meta.url,
                    });
                    
                    results.push({ url: meta.url, status: 'success', postId });
                    successCount++;
                }

            } catch (err) {
                console.error("Error parsing row: ", err);
            }
        }

        return NextResponse.json({
            success: true,
            totalProcessed: successCount,
            results
        });

    } catch (error) {
        console.error('Batch collect endpoint error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown server error' },
            { status: 500 }
        );
    }
}
