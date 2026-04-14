import { NextRequest, NextResponse } from 'next/server';
import { addDocument, queryCollection, updateDocument, serverTimestamp } from '@/lib/appwrite/database';
import { getGrokKey } from '@/lib/grok-client';
import { safeParseAIJson } from '@/lib/ai-utils';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { normalizeTopicId } from '@/lib/db/topics';

/**
 * POST /api/user/import-phrases
 * 
 * Bulk import vocabulary with drip-feed SRS scheduling.
 * - Max 200 phrases per import
 * - 1 import per day
 * - Stagger nextReviewDate by user-selected drip pace (1-15/day)
 * - Background AI enrichment: topics, register, potentialUsages
 */

const MAX_IMPORT_SIZE = 200;
const MAX_DRIP_PACE = 15;

const XAI_API_KEY = getGrokKey('phrases');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

interface ImportPhraseInput {
    phrase: string;
    meaning: string;
    context?: string;
}

interface ImportRequest {
    phrases: ImportPhraseInput[];
    dripPace: number; // 1-15 phrases per day
}

// ─── Background AI Enrichment ─────────────────────────

async function enrichPhrase(
    phraseId: string,
    phrase: string,
    meaning: string,
    userId: string,
    userEmail: string,
) {
    if (!XAI_API_KEY) return;

    // 1. Assign topics
    try {
        const topicResult = await assignTopicForImport(phrase, meaning, userId, userEmail);
        if (topicResult.topic && topicResult.topic !== 'pending_ai') {
            await updateDocument('savedPhrases', phraseId, {
                topic: topicResult.topic,
                subtopic: topicResult.subtopic || null,
                topics: [topicResult.topic],
            });
        }
    } catch (e) {
        console.error(`[import-enrich] Topic assignment failed for ${phraseId}:`, e);
    }

    // 2. Generate register + nuance
    try {
        const lookupResult = await lookupRegister(phrase, meaning, userEmail);
        if (lookupResult.register) {
            await updateDocument('savedPhrases', phraseId, {
                register: [lookupResult.register],
                nuance: [lookupResult.nuance || 'neutral'],
            });
        }
    } catch (e) {
        console.error(`[import-enrich] Register lookup failed for ${phraseId}:`, e);
    }

    // 3. Generate potentialUsages (Layer 1 variants)
    try {
        const usages = await generatePotentialUsages(phrase, meaning);
        if (usages.length > 0) {
            await updateDocument('savedPhrases', phraseId, {
                potentialUsages: JSON.stringify(usages),
            });
        }
    } catch (e) {
        console.error(`[import-enrich] PotentialUsages failed for ${phraseId}:`, e);
    }
}

async function assignTopicForImport(
    phrase: string,
    meaning: string,
    userId: string,
    userEmail: string,
): Promise<{ topic: string; subtopic?: string }> {
    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            messages: [{
                role: 'user',
                content: `Assign a topic for this vocabulary phrase in a learning app.

PHRASE: "${phrase}"
MEANING: ${meaning}

Pick from these broad topics (use the exact ID):
technology, health_fitness, education_learning, work_career, relationships_social_life, psychology_mindset, environment_nature, entertainment_media, travel_culture, food_lifestyle, money_finance, communication_language, science, art_creativity, sports_competition, daily_life

Return JSON: { "topic_id": "...", "subtopic_id": "optional_niche_id", "subtopic_label": "Optional Niche Label" }`
            }],
            max_tokens: 150,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) return { topic: 'daily_life' };

    const data = await response.json();
    if (data.usage) {
        logTokenUsage({
            userId, userEmail,
            endpoint: 'import-topic-assign',
            model: 'grok-4-1-fast-non-reasoning',
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
        });
    }

    const text = data.choices?.[0]?.message?.content || '';
    const parsed = safeParseAIJson<{ topic_id?: string; subtopic_id?: string }>(text);
    if (!parsed.success) return { topic: 'daily_life' };

    return {
        topic: normalizeTopicId(parsed.data.topic_id || 'daily_life'),
        subtopic: parsed.data.subtopic_id ? normalizeTopicId(parsed.data.subtopic_id) : undefined,
    };
}

async function lookupRegister(
    phrase: string,
    meaning: string,
    userEmail: string,
): Promise<{ register: string; nuance: string }> {
    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            messages: [{
                role: 'user',
                content: `Analyze the register and nuance of this English phrase.

PHRASE: "${phrase}"
MEANING: ${meaning}

Register: casual (spoken/informal), consultative (standard), formal (written/official)
Nuance: positive, slightly_positive, neutral, slightly_negative, negative

Return JSON: { "register": "casual|consultative|formal", "nuance": "positive|slightly_positive|neutral|slightly_negative|negative" }`
            }],
            max_tokens: 80,
            temperature: 0.2,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) return { register: 'consultative', nuance: 'neutral' };

    const data = await response.json();
    if (data.usage) {
        logTokenUsage({
            userId: 'import', userEmail,
            endpoint: 'import-register-lookup',
            model: 'grok-4-1-fast-non-reasoning',
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
        });
    }

    const text = data.choices?.[0]?.message?.content || '';
    const parsed = safeParseAIJson<{ register?: string; nuance?: string }>(text);
    if (!parsed.success) return { register: 'consultative', nuance: 'neutral' };

    return {
        register: parsed.data.register || 'consultative',
        nuance: parsed.data.nuance || 'neutral',
    };
}

async function generatePotentialUsages(
    phrase: string,
    meaning: string,
): Promise<Array<{ phrase: string; meaning: string; type: 'usage' | 'connotation'; isSingleWord: boolean }>> {
    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            messages: [{
                role: 'user',
                content: `Generate vocabulary children for a learning app.

PHRASE: "${phrase}"
MEANING: ${meaning}

Generate:
1. COMMON USAGES (2-3): Natural collocations/expressions using this word
2. CONNOTATIONS (1-2): Same meaning, different sentiment/tone

Return JSON:
{
  "usages": [{ "phrase": "...", "meaning": "...", "isSingleWord": false }],
  "connotations": [{ "phrase": "...", "meaning": "...", "isSingleWord": false }]
}`
            }],
            max_tokens: 400,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parsed = safeParseAIJson<{
        usages?: Array<{ phrase: string; meaning: string; isSingleWord?: boolean }>;
        connotations?: Array<{ phrase: string; meaning: string; isSingleWord?: boolean }>;
    }>(text);

    if (!parsed.success) return [];

    const results: Array<{ phrase: string; meaning: string; type: 'usage' | 'connotation'; isSingleWord: boolean }> = [];

    (parsed.data.usages || []).slice(0, 3).forEach(u => {
        results.push({ phrase: u.phrase, meaning: u.meaning, type: 'usage', isSingleWord: u.isSingleWord || false });
    });

    (parsed.data.connotations || []).slice(0, 2).forEach(c => {
        results.push({ phrase: c.phrase, meaning: c.meaning, type: 'connotation', isSingleWord: c.isSingleWord || false });
    });

    return results;
}

// ─── Main Handler ─────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        // Auth
        const { getAuthFromRequest } = await import('@/lib/appwrite/auth-admin');
        const authUser = await getAuthFromRequest(request);
        let userId = authUser?.userId || request.headers.get('x-user-id') || undefined;
        let userEmail = authUser?.userEmail || request.headers.get('x-user-email') || undefined;

        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: ImportRequest = await request.json();
        const { phrases, dripPace: rawDripPace } = body;
        const dripPace = Math.max(1, Math.min(MAX_DRIP_PACE, rawDripPace || 10));

        // ─── Validation ───
        if (!phrases || !Array.isArray(phrases) || phrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        if (phrases.length > MAX_IMPORT_SIZE) {
            return NextResponse.json({
                error: `Maximum ${MAX_IMPORT_SIZE} phrases per import. You provided ${phrases.length}.`,
            }, { status: 400 });
        }

        // ─── Rate Limit: 1 import per day ───
        // Note: 'source' is stored in the 'difficulty' field (Appwrite schema limit workaround)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const existingPhrases = await queryCollection('savedPhrases', {
            where: [
                { field: 'userId', op: '==', value: userId },
                { field: 'difficulty', op: '==', value: 'import' },
                { field: 'createdAt', op: '>=', value: today.toISOString() },
            ],
            limit: 1,
        });

        if (existingPhrases.length > 0) {
            return NextResponse.json({
                error: '1 import per day. Your next import is available tomorrow.',
            }, { status: 429 });
        }

        // ─── Fetch existing phrases for dedup ───
        const userPhrases = await queryCollection('savedPhrases', {
            where: [{ field: 'userId', op: '==', value: userId }],
            limit: 5000,
        });
        const existingBaseForms = new Set(
            userPhrases.map(p => ((p.baseForm as string) || (p.phrase as string) || '').toLowerCase())
        );

        // ─── Process & Dedup ───
        const importBatchId = `imp_${Date.now()}`;
        const importedIds: string[] = [];
        const skippedDuplicates: string[] = [];
        const errors: string[] = [];
        const seenInBatch = new Set<string>();
        let validIndex = 0;

        for (const item of phrases) {
            const phrase = (item.phrase || '').trim();
            const meaning = (item.meaning || '').trim();

            if (!phrase || !meaning) {
                errors.push(`Invalid: "${phrase || '(empty)'}" — missing ${!phrase ? 'phrase' : 'meaning'}`);
                continue;
            }

            const baseForm = phrase.toLowerCase();

            // In-batch dedup
            if (seenInBatch.has(baseForm)) {
                skippedDuplicates.push(phrase);
                continue;
            }

            // Cross-DB dedup
            if (existingBaseForms.has(baseForm)) {
                skippedDuplicates.push(phrase);
                continue;
            }

            seenInBatch.add(baseForm);

            // Stagger review dates
            const dayOffset = Math.floor(validIndex / dripPace);
            const reviewDate = new Date();
            reviewDate.setDate(reviewDate.getDate() + 1 + dayOffset);
            reviewDate.setHours(0, 0, 0, 0);

            const phraseData = {
                userId,
                phrase,
                baseForm,
                meaning,
                context: item.context || '',
                register: JSON.stringify(['consultative']),
                nuance: JSON.stringify(['neutral']),
                socialDistance: JSON.stringify(['neutral']),
                topic: 'pending_ai',
                subtopic: null,
                topics: ['pending_ai'],
                subtopics: [],
                // Schema workaround: 'difficulty' stores source type ('import' / 'reading')
                // 'postId' stores importBatchId (empty for reading-sourced phrases)
                difficulty: 'import',
                postId: importBatchId,
                sourcePostId: null,
                usedForGeneration: false,
                usageCount: 0,
                practiceCount: 0,
                createdAt: serverTimestamp(),
                learningStep: 0,
                nextReviewDate: reviewDate.toISOString(),
                lastReviewDate: null,
                children: [],
                potentialUsages: JSON.stringify([]),
                contexts: JSON.stringify([{
                    id: `ctx_${Date.now()}_${validIndex}`,
                    type: 'import',
                    sourcePostId: null,
                    question: '',
                    unlocked: true,
                    masteryLevel: 0,
                    lastPracticed: null,
                }]),
                currentContextIndex: 0,
                parentPhraseId: null,
                layer: 0,
                hasAppearedInExercise: false,
            };

            try {
                const phraseId = await addDocument('savedPhrases', phraseData);
                importedIds.push(phraseId);
                validIndex++;
            } catch (e) {
                console.error(`[import] Failed to insert "${phrase}":`, e);
                errors.push(`Failed to save "${phrase}"`);
            }
        }

        const daysToComplete = validIndex > 0 ? Math.ceil(validIndex / dripPace) : 0;

        // ─── Background AI Enrichment (non-blocking) ───
        if (importedIds.length > 0) {
            (async () => {
                console.log(`[import-enrich] Starting enrichment for ${importedIds.length} phrases...`);
                for (let i = 0; i < importedIds.length; i++) {
                    const item = phrases.find(p => {
                        const bf = (p.phrase || '').trim().toLowerCase();
                        return seenInBatch.has(bf);
                    });

                    // Re-derive phrase/meaning from the valid items
                    const validItems = phrases.filter(p => {
                        const bf = (p.phrase || '').trim().toLowerCase();
                        return bf && (p.meaning || '').trim() && !existingBaseForms.has(bf);
                    });
                    // Deduplicate validItems in order
                    const seenValid = new Set<string>();
                    const uniqueValidItems: ImportPhraseInput[] = [];
                    for (const vi of validItems) {
                        const bf = vi.phrase.trim().toLowerCase();
                        if (!seenValid.has(bf)) {
                            seenValid.add(bf);
                            uniqueValidItems.push(vi);
                        }
                    }

                    if (i < uniqueValidItems.length) {
                        try {
                            await enrichPhrase(
                                importedIds[i],
                                uniqueValidItems[i].phrase.trim(),
                                uniqueValidItems[i].meaning.trim(),
                                userId!,
                                userEmail || '',
                            );
                        } catch (e) {
                            console.error(`[import-enrich] Failed for phrase ${importedIds[i]}:`, e);
                        }

                        // Throttle: 200ms between phrases
                        if (i < importedIds.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                }
                console.log(`[import-enrich] Enrichment complete for ${importedIds.length} phrases.`);
            })();
        }

        return NextResponse.json({
            success: true,
            imported: importedIds.length,
            skipped: skippedDuplicates.length,
            duplicates: skippedDuplicates,
            errors,
            daysToComplete,
            dripPace,
            importBatchId,
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[import-phrases] Error:', msg);
        return NextResponse.json({ error: `Import failed: ${msg}` }, { status: 500 });
    }
}
