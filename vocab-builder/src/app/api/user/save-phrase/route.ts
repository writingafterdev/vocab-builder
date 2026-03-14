import { NextRequest, NextResponse } from 'next/server';
import { addDocument, queryCollection, serverTimestamp } from '@/lib/firestore-rest';
import { logTokenUsage } from '@/lib/db/token-tracking';

import { safeParseAIJson } from '@/lib/ai-utils';

/**
 * Save a new phrase to user's vocab bank
 * Auto-assigns topics using AI if not provided
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

interface ChildExpression {
    type: 'collocation' | 'phrasal_verb';
    phrase: string;
    meaning: string;
    register: 'casual' | 'consultative' | 'formal';
    nuance: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    topics: string[];
}

interface SavePhraseRequest {
    phrase: string;      // The exact form encountered (e.g., "worked")
    baseForm?: string;   // The dictionary form for dedup (e.g., "work")
    meaning: string;
    context?: string;
    register?: 'casual' | 'consultative' | 'formal';
    nuance?: 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';
    topics?: string[];
    potentialUsages?: Array<{  // Silent metadata for exercise generation
        phrase: string;
        meaning: string;
        example?: string;
        type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
    }>;
    audioUrl?: string;   // Dictionary audio URL for pronunciation
    phonetic?: string;   // IPA phonetic transcription
    socialDistance?: SocialDistance[]; // NEW

    // For Layer 1+ saving (child phrases)
    parentPhraseId?: string;  // ID of parent phrase (for linking)
    layer?: number;           // 0 = root, 1+ = child (affects potentialUsages generation)
}

import {
    normalizeTopicId
} from '@/lib/db/topics';
import { SocialDistance } from '@/lib/db/types';

// Assign topic and subtopic to phrase using AI (association-aware)
async function assignTopics(phrase: string, meaning: string, userId: string, userEmail: string): Promise<{ topic: string; subtopic?: string }> {
    if (!XAI_API_KEY) return { topic: 'daily_life' };

    const { setDocument, updateDocument, runQuery } = await import('@/lib/firestore-rest');

    // 1. Fetch existing topic definitions
    let existingTopics: any[] = [];
    try {
        existingTopics = await queryCollection('topics');
    } catch (e) {
        console.error('Failed to fetch topics for AI', e);
    }

    // 2. Fetch user's saved phrases to build subtopic → phrases map
    let userPhrases: any[] = [];
    try {
        userPhrases = await runQuery('savedPhrases', [
            { field: 'userId', op: 'EQUAL', value: userId },
        ], 200); // cap at 200 for prompt size
    } catch (e) {
        console.error('Failed to fetch user phrases for topic context', e);
    }

    // Build subtopic clusters: { "topic/subtopic" → ["phrase1", "phrase2"] }
    const subtopicClusters: Record<string, { topic: string; topicLabel: string; subtopic: string; subtopicLabel: string; phrases: string[] }> = {};
    for (const p of userPhrases) {
        const t = p.topic || p.topics?.[0];
        const s = p.subtopic || p.subtopics?.[0];
        if (!t || !s || t === 'pending_ai') continue;
        const key = `${t}/${s}`;
        if (!subtopicClusters[key]) {
            // Find labels from existing topics
            const topicDef = existingTopics.find((et: any) => et.id === t);
            const subtopicDef = topicDef?.subtopics?.find((st: any) => st.id === s);
            subtopicClusters[key] = {
                topic: t,
                topicLabel: topicDef?.label || t,
                subtopic: s,
                subtopicLabel: subtopicDef?.label || s,
                phrases: [],
            };
        }
        subtopicClusters[key].phrases.push(p.phrase);
    }

    // Format user's vocab clusters for the prompt
    let vocabContext = "No saved vocabulary yet.";
    const clusterEntries = Object.values(subtopicClusters);
    if (clusterEntries.length > 0) {
        vocabContext = clusterEntries.map(c =>
            `- ${c.topicLabel} > ${c.subtopicLabel}: ${c.phrases.slice(0, 5).map(p => `"${p}"`).join(', ')}${c.phrases.length > 5 ? ` (+${c.phrases.length - 5} more)` : ''}`
        ).join('\n');
    }

    // Format available topics/subtopics
    let topicList = "No defined topics yet.";
    if (existingTopics.length > 0) {
        topicList = existingTopics.map(topic =>
            topic.subtopics && topic.subtopics.length > 0
                ? `- ${topic.label} (${topic.id}): ${topic.subtopics.map((s: any) => `${s.label} (${s.id})`).join(', ')}`
                : `- ${topic.label} (${topic.id})`
        ).join('\n');
    }

    try {
        const prompt = `You are assigning topics for a vocabulary learning app that uses ASSOCIATION-BASED RECALL.
Words in the same subtopic trigger each other during practice — so clustering related words together is critical.

RULES FOR TOPICS:
1. Topics must be VERY GENERAL — think IELTS speaking test categories. Here are the ONLY acceptable broad topics (use these exact names or very close equivalents):
   Technology, Health & Fitness, Education & Learning, Work & Career, Relationships & Social Life, Psychology & Mindset, Environment & Nature, Entertainment & Media, Travel & Culture, Food & Lifestyle, Money & Finance, Communication & Language, Science, Art & Creativity, Sports & Competition, Daily Life
2. NEVER create a niche or specific topic. If something feels niche, it belongs as a SUBTOPIC under one of the broad topics above.
3. Subtopics should be NICHE daily-life situations people actually encounter (e.g., "morning routines", "workplace feedback", "social media habits", "dealing with stress", "spending habits")

ASSIGNMENT PRIORITY (follow this order strictly):
1. REUSE an existing subtopic if the new phrase ASSOCIATES well with words already there (even loosely — they should trigger each other in memory)
2. If no existing subtopic fits, ADD a new subtopic under an existing topic
3. Only create an entirely new topic if nothing existing works at all

USER'S CURRENT VOCAB BY SUBTOPIC:
${vocabContext}

AVAILABLE TOPICS & SUBTOPICS:
${topicList}

NEW PHRASE: "${phrase}"
MEANING: ${meaning}

Which subtopic does this phrase best associate with? Think about what other words/phrases a learner would mentally connect with this one.

Response format (JSON only):
{
  "topic_id": "existing_or_new_id",
  "topic_label": "Display Name",
  "subtopic_id": "existing_or_new_id",
  "subtopic_label": "Display Name",
  "is_new_topic": false,
  "is_new_subtopic": false,
  "reason": "brief explanation of why this subtopic fits"
}`;

        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
                temperature: 0.3,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) return { topic: 'daily_life' };

        const data = await response.json();

        // Log token usage
        if (data.usage) {
            logTokenUsage({
                userId,
                userEmail,
                endpoint: 'save-phrase-topics',
                model: 'grok-4-1-fast-reasoning',
                promptTokens: data.usage.prompt_tokens || 0,
                completionTokens: data.usage.completion_tokens || 0,
                totalTokens: data.usage.total_tokens || 0,
            });
        }

        const text = data.choices?.[0]?.message?.content || '';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parseResult = safeParseAIJson<{ topic_id?: string; topic_label?: string; subtopic_id?: string; subtopic_label?: string; is_new_topic?: boolean; is_new_subtopic?: boolean; reason?: string }>(cleaned);
        if (!parseResult.success) return { topic: 'daily_life' };
        const parsed = parseResult.data;

        console.log(`[topic-assign] "${phrase}" → ${parsed.topic_label}/${parsed.subtopic_label} (${parsed.reason || 'no reason'})`);

        // Normalize IDs
        const topicId = normalizeTopicId(parsed.topic_id || parsed.topic_label || 'daily_life');
        const subtopicId = parsed.subtopic_id || parsed.subtopic_label
            ? normalizeTopicId(parsed.subtopic_id || parsed.subtopic_label || '')
            : undefined;

        // Check if topic exists
        const existingTopic = existingTopics.find(t => t.id === topicId);

        if (!existingTopic && parsed.is_new_topic) {
            // Create new topic
            await setDocument('topics', topicId, {
                label: parsed.topic_label || topicId,
                subtopics: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            console.log(`Created new topic: ${topicId}`);
        }

        // Check if subtopic needs to be added
        if (subtopicId && existingTopic) {
            const existingSubtopic = existingTopic.subtopics?.find((s: any) => s.id === subtopicId);
            if (!existingSubtopic && parsed.is_new_subtopic) {
                const newSubtopics = [...(existingTopic.subtopics || []), { id: subtopicId, label: parsed.subtopic_label || subtopicId }];
                await updateDocument('topics', topicId, {
                    subtopics: newSubtopics,
                    updatedAt: serverTimestamp(),
                });
                console.log(`Added new subtopic: ${subtopicId} to ${topicId}`);
            }
        } else if (subtopicId && parsed.is_new_topic) {
            // New topic with new subtopic
            const newSubtopics = [{ id: subtopicId, label: parsed.subtopic_label || subtopicId }];
            await updateDocument('topics', topicId, {
                subtopics: newSubtopics,
                updatedAt: serverTimestamp(),
            });
            console.log(`Added subtopic ${subtopicId} to new topic ${topicId}`);
        }

        return {
            topic: topicId,
            subtopic: subtopicId,
        };
    } catch (error) {
        console.error('Topic assignment error:', error);
        return { topic: 'daily_life' };
    }
}

/** Recursively flatten nested arrays into a flat string[] — Firestore does not allow nested arrays */
function flattenToStringArray(value: unknown): string[] {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(flattenToStringArray);
    return [String(value)];
}

export async function POST(request: NextRequest) {
    try {
        // Secure authentication - verify Firebase ID token
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);

        // Fallback to header-based auth for backward compatibility (deprecate later)
        let userId = authUser?.userId;
        let userEmail = authUser?.userEmail;

        if (!userId) {
            // Legacy fallback - will be removed after migration
            userEmail = request.headers.get('x-user-email') || undefined;
            userId = request.headers.get('x-user-id') || undefined;
        }

        if (!userEmail && !userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body: SavePhraseRequest = await request.json();
        const { phrase, baseForm, meaning, context, register, nuance, socialDistance, topics, subtopics, potentialUsages, audioUrl, phonetic, parentPhraseId, layer = 0 } = body as SavePhraseRequest & { subtopics?: string[] };

        if (!phrase || !meaning) {
            return NextResponse.json({ error: 'Missing phrase or meaning' }, { status: 400 });
        }

        // Use userId directly if provided, else look up by email
        let resolvedUserId = userId;
        if (!resolvedUserId && userEmail) {
            try {
                // Query users collection for email using REST API
                const users = await queryCollection('users');
                const matchingUser = users.find(u => u.email === userEmail);

                if (!matchingUser) {
                    return NextResponse.json({ error: `User not found for email: ${userEmail}` }, { status: 404 });
                }

                resolvedUserId = matchingUser.id as string;
            } catch (lookupError) {
                console.error('User lookup error:', lookupError);
                return NextResponse.json({ error: `User lookup failed: ${lookupError}` }, { status: 500 });
            }
        }

        if (!resolvedUserId) {
            return NextResponse.json({ error: 'Could not resolve user' }, { status: 404 });
        }

        // Check daily phrase limit (15 per day)
        const DAILY_PHRASE_LIMIT = 15;
        const allPhrases = await queryCollection('savedPhrases');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        // Check if this phrase already exists for this user (duplicate detection)
        // Use baseForm for matching if provided (handles variations like worked/work)
        const matchForm = (baseForm || phrase).trim().toLowerCase();
        const existingPhrase = allPhrases.find(p => {
            if (p.userId !== resolvedUserId) return false;
            // Match on baseForm if available, otherwise exact phrase
            const savedForm = ((p.baseForm as string) || (p.phrase as string) || '').toLowerCase();
            return savedForm === matchForm;
        });

        if (existingPhrase) {
            // Phrase already exists - update it instead of creating duplicate
            const { updateDocument } = await import('@/lib/firestore-rest');

            // Increment a "reviewPriority" counter (signals they need more practice)
            const currentPriority = (existingPhrase.reviewPriority as number) || 0;
            const existingContexts = (existingPhrase.contexts as string[]) || [];

            // Add new context if different
            const newContexts = context && !existingContexts.includes(context)
                ? [...existingContexts, context].slice(-5) // Keep last 5 contexts
                : existingContexts;

            await updateDocument('savedPhrases', existingPhrase.id as string, {
                reviewPriority: currentPriority + 1,
                contexts: newContexts,
                lastEncounteredAt: new Date().toISOString(),
            });

            return NextResponse.json({
                success: true,
                isDuplicate: true,
                phraseId: existingPhrase.id,
                message: `Already saved! Marked for extra review (seen ${currentPriority + 1} times)`,
                reviewPriority: currentPriority + 1,
            });
        }

        const todayPhrases = allPhrases.filter(p => {
            if (p.userId !== resolvedUserId) return false;
            const createdAt = p.createdAt;
            if (!createdAt) return false;
            const phraseDate = new Date(createdAt as string);
            return phraseDate.getTime() >= todayTimestamp;
        });

        // Count all expressions: root phrases + children
        let currentSaved = 0;
        todayPhrases.forEach(p => {
            const pChildren = (p as any).children || [];
            currentSaved += 1 + pChildren.length;
        });

        // Count how many expressions we're about to save (just root, children start empty)
        const incomingCount = 1;

        if (currentSaved + incomingCount > DAILY_PHRASE_LIMIT) {
            return NextResponse.json({
                error: `Daily limit reached! You've saved ${currentSaved} expressions today. Trying to save ${incomingCount} more would exceed the ${DAILY_PHRASE_LIMIT} limit.`,
                saved: currentSaved,
                limit: DAILY_PHRASE_LIMIT
            }, { status: 429 });
        }

        // First review in 1 day (not immediately)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // Midnight tomorrow

        // Use provided topics/subtopics or auto-assign with AI
        let assignedTopic = topics?.[0] || null;
        let assignedSubtopic: string | null = subtopics?.[0] || null;

        if (!assignedTopic) {
            assignedTopic = 'pending_ai';
            assignedSubtopic = null;
        }

        const phraseData = {
            userId: resolvedUserId,
            phrase: phrase.trim(),
            baseForm: (baseForm || phrase).trim().toLowerCase(), // For duplicate matching
            meaning: meaning.trim(),
            context: context || '',
            register: flattenToStringArray(register || 'consultative'),
            nuance: flattenToStringArray(nuance || 'neutral'),
            socialDistance: flattenToStringArray(socialDistance || 'neutral'),
            topic: assignedTopic,
            subtopic: assignedSubtopic,
            topics: flattenToStringArray(topics && topics.length > 0 ? topics : (assignedTopic ? [assignedTopic] : [])),
            subtopics: flattenToStringArray(subtopics && subtopics.length > 0 ? subtopics : (assignedSubtopic ? [assignedSubtopic] : [])),
            sourcePostId: null,
            usedForGeneration: false,
            usageCount: 0,
            practiceCount: 0,
            createdAt: serverTimestamp(),
            learningStep: 0,
            nextReviewDate: tomorrow, // Use plain Date, firestore-rest converts to timestampValue
            lastReviewDate: null,
            // Children start empty - populated through exercises later
            children: [],
            // Silent metadata for exercise generation
            potentialUsages: potentialUsages || [],
            contexts: [{
                id: `ctx_${Date.now()}`,
                type: 'scenario',
                sourcePostId: null,
                question: '',
                unlocked: true,
                masteryLevel: 0,
                lastPracticed: null,
            }],
            currentContextIndex: 0,
            // Parent-child linking for Layer 1+ saves
            parentPhraseId: parentPhraseId || null,
            layer: layer,
            hasAppearedInExercise: layer > 0, // Layer 1+ items came from exercise
        };

        const phraseId = await addDocument('savedPhrases', phraseData);

        // If this is a child phrase (Layer 1+), update the parent
        if (parentPhraseId) {
            try {
                const { updateDocument, getDocument } = await import('@/lib/firestore-rest');
                const parentDoc = await getDocument('savedPhrases', parentPhraseId) as Record<string, any> | null;

                if (parentDoc) {
                    // Mark the child as exposed in parent's potentialUsages
                    const parentPotentialUsages: any[] = parentDoc.potentialUsages || [];
                    const updatedPotentialUsages = parentPotentialUsages.map((p) => ({
                        ...p,
                        exposed: p.phrase.toLowerCase() === phrase.trim().toLowerCase() ? true : p.exposed,
                    }));

                    // Add new phrase ID to parent's childPhraseIds
                    const existingChildIds = Array.isArray(parentDoc.childPhraseIds)
                        ? parentDoc.childPhraseIds
                        : [];

                    await updateDocument('savedPhrases', parentPhraseId, {
                        potentialUsages: updatedPotentialUsages,
                        childPhraseIds: [...existingChildIds, phraseId],
                    });
                }
            } catch (parentUpdateError) {
                console.error('Failed to update parent phrase:', parentUpdateError);
                // Continue - the phrase was saved, just parent link failed
            }
        }

        // --- BACKGROUND PROCESSING (Non-blocking) ---
        // If topic needs AI assignment, do it in the background to keep the API fast
        if (!topics?.[0]) {
            // Self-executing async function that won't block the API response
            (async () => {
                try {
                    const assigned = await assignTopics(phrase, meaning, resolvedUserId, userEmail || '');
                    if (assigned.topic && assigned.topic !== 'pending_ai') {
                        const { updateDocument } = await import('@/lib/firestore-rest');
                        await updateDocument('savedPhrases', phraseId, {
                            topic: assigned.topic,
                            subtopic: assigned.subtopic || null,
                        });
                        console.log(`[save-phrase] Background AI topic assigned: ${assigned.topic} for phrase ${phraseId}`);
                    }
                } catch (bgError) {
                    console.error('[save-phrase] Background topic assignment failed:', bgError);
                }
            })();
        }

        // Count after save (including children)
        const newTodayCount = currentSaved + incomingCount;
        const remaining = Math.max(0, DAILY_PHRASE_LIMIT - newTodayCount);


        return NextResponse.json({
            success: true,
            phraseId: phraseId,
            todayCount: newTodayCount,
            remaining: remaining,
            limit: DAILY_PHRASE_LIMIT,
            isChildPhrase: !!parentPhraseId,
            parentPhraseId: parentPhraseId || null,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('Save phrase error:', errorMessage, errorStack, error);
        return NextResponse.json({ error: `Internal server error: ${errorMessage}`, stack: errorStack }, { status: 500 });
    }
}
