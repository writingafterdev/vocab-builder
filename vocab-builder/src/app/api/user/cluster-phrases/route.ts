import { NextRequest, NextResponse } from 'next/server';
import { logTokenUsage } from '@/lib/db/token-tracking';
import { runQuery } from '@/lib/firestore-rest';

/**
 * LOGIC-FIRST CLUSTERING ENGINE
 * 1. Deterministic Grouping (Topic -> Register -> Social)
 * 2. Backfill (Orphan Repair)
 * 3. AI Labeling (Context Generation)
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

interface ClusteringInput {
    phrases: Array<{
        id: string;
        phrase: string;
        meaning: string;
        tags: {
            topics?: string[];
            register?: string | string[];
            socialDistance?: string | string[];
        };
        history?: {
            lastUsedTags?: any;
        }
    }>;
}

interface PhraseGroup {
    id: string; // Unique ID for the group (e.g. "Business-Formal")
    topic: string;
    subtopic?: string;
    register: string;
    socialDistance: string;
    phrases: any[];
    isBackfilled?: boolean;
}

export async function POST(request: NextRequest) {
    let body: ClusteringInput | null = null;
    try {
        const { getAuthFromRequest } = await import('@/lib/firebase-admin');
        const authUser = await getAuthFromRequest(request);
        const userId = authUser?.userId || request.headers.get('x-user-id');
        const userEmail = authUser?.userEmail || 'admin';

        if (!userId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        if (!body || !body.phrases || body.phrases.length === 0) {
            return NextResponse.json({ error: 'No phrases provided' }, { status: 400 });
        }

        const { phrases } = body;

        // 1. DETERMINISTIC GROUPING
        let groups = groupPhrasesDeterministically(phrases);

        // 2. BACKFILL (Repair Orphans)
        if (userId) {
            groups = await backfillClusters(groups, userId);
        }

        // 3. AI LABELING (Context Generation)
        // If API key missing, return raw groups
        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json({
                clusters: groups.map(g => ({
                    theme: `${g.topic} (${g.register})`,
                    context: `Practice reviewing ${g.topic} words in a ${g.register} context.`,
                    pragmatics: { register: g.register, relationship: g.socialDistance },
                    phraseIds: g.phrases.map(p => p.id)
                }))
            });
        }

        const labeledClusters = await labelClustersWithAI(groups, userEmail, userId);

        // DEBUG: Log cluster contents
        console.log(`[cluster-phrases] Returning ${labeledClusters.length} clusters:`);
        labeledClusters.forEach((c: any, i: number) => {
            console.log(`  Cluster ${i + 1} "${c.theme}": ${c.phrases?.length || 0} phrases - ${c.phrases?.map((p: any) => p.phrase).join(', ')}`);
        });

        return NextResponse.json({ clusters: labeledClusters });

    } catch (error) {
        console.error('Cluster phrases error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// --------------------------------------------------------------------------
// 2. BACKFILL LOGIC
// --------------------------------------------------------------------------
export async function backfillClusters(groups: PhraseGroup[], userId: string): Promise<PhraseGroup[]> {
    const updatedGroups = [...groups];

    for (const group of updatedGroups) {
        // Only backfill small groups (orphans)
        if (group.phrases.length < 3) {
            try {
                // Parse topic and subtopic from group.topic
                // Format could be "business (negotiations)" or just "business"
                const topicMatch = group.topic.match(/^([^(]+)(?:\s*\(([^)]+)\))?/);
                const primaryTopic = topicMatch?.[1]?.trim() || group.topic;
                const subtopic = topicMatch?.[2]?.trim() || '';

                // Fetch candidates sharing the primary topic
                const candidates = await runQuery(
                    'savedPhrases',
                    [
                        { field: 'userId', op: 'EQUAL', value: userId },
                        { field: 'topics', op: 'ARRAY_CONTAINS', value: primaryTopic }
                    ],
                    30 // Fetch more to filter by subtopic
                );

                // Filter candidates:
                // 1. Not already in the group
                // 2. Matches Register (loose match)
                // 3. Prioritize matching subtopic
                const currentIds = new Set(group.phrases.map(p => p.id));

                const filteredCandidates = candidates.filter(c => {
                    if (currentIds.has(c.id)) return false;

                    // Check Register Match
                    const cRegs = Array.isArray(c.register) ? c.register : [c.register || 'neutral'];
                    const groupReg = group.register.toLowerCase();

                    // Allow neutral to flow anywhere, otherwise strict match
                    if (groupReg === 'neutral') return true;
                    if (cRegs.some((r: any) => r.toLowerCase().includes(groupReg))) return true;
                    if (cRegs.some((r: any) => r.toLowerCase().includes('neutral'))) return true;

                    return false;
                });

                // Sort candidates: prioritize subtopic matches
                const sortedCandidates = filteredCandidates.sort((a: any, b: any) => {
                    if (!subtopic) return 0;

                    const aSubtopics = a.subtopics || a.tags?.subtopics || [];
                    const bSubtopics = b.subtopics || b.tags?.subtopics || [];

                    const aHasSubtopic = Array.isArray(aSubtopics)
                        ? aSubtopics.some((s: string) => s.toLowerCase() === subtopic.toLowerCase())
                        : aSubtopics?.toLowerCase() === subtopic.toLowerCase();
                    const bHasSubtopic = Array.isArray(bSubtopics)
                        ? bSubtopics.some((s: string) => s.toLowerCase() === subtopic.toLowerCase())
                        : bSubtopics?.toLowerCase() === subtopic.toLowerCase();

                    if (aHasSubtopic && !bHasSubtopic) return -1;
                    if (!aHasSubtopic && bHasSubtopic) return 1;
                    return 0;
                });

                // Add up to 3 extras to reach min size of 3-5
                for (const extra of sortedCandidates) {
                    if (group.phrases.length >= 4) break; // Cap at 4-5 via backfill
                    group.phrases.push({
                        id: extra.id,
                        phrase: (extra.phrase as string),
                        meaning: (extra.meaning as string),
                        tags: {
                            topics: (extra.topics as string[]),
                            subtopics: (extra.subtopics as string[]),
                            register: extra.register,
                            socialDistance: extra.socialDistance
                        },
                        isBackfilled: true
                    });
                    group.isBackfilled = true;
                }

                if (group.isBackfilled) {
                    console.log(`[backfill] Group "${group.topic}": added ${group.phrases.length - 1} phrases (subtopic: ${subtopic || 'none'})`);
                }
            } catch (err) {
                console.error('Backfill failed for group', group.topic, err);
                // Continue without backfill
            }
        }
    }
    return updatedGroups;
}

// --------------------------------------------------------------------------
// 1. DETERMINISTIC GROUPING LOGIC
// --------------------------------------------------------------------------
export function groupPhrasesDeterministically(phrases: any[]): PhraseGroup[] {
    const groups: Map<string, PhraseGroup> = new Map();

    phrases.forEach(p => {
        // A. Primary Filter: Topic (with Full Round-Robin Context Rotation)
        const topics: string[] = p.tags?.topics || ['General'];
        let topic = topics[0]; // Default: first topic

        // Full Round-Robin: Cycle through ALL topics before repeating
        if (topics.length > 1 && p.practiceHistory?.usedContexts?.length > 0) {
            // Get list of all topics already used
            const usedTopics = new Set(
                p.practiceHistory.usedContexts.map((ctx: any) => ctx.topic)
            );

            // Find the first topic that has NOT been used yet
            const unusedTopic = topics.find((t: string) => !usedTopics.has(t));

            if (unusedTopic) {
                // Use the next unused topic
                topic = unusedTopic;
            } else {
                // All topics exhausted → Reset cycle, start from first topic
                // (This means they've practiced in every possible context!)
                topic = topics[0];
            }
        }

        // A2. Subtopic (for finer grouping within Topic)
        const subtopics = p.tags?.subtopics || p.tags?.subtopic || [];
        const subtopic = Array.isArray(subtopics) ? (subtopics[0] || '') : (subtopics || '');

        // B. Secondary Filter: Pragmatics
        // Normalize Register
        let register = 'neutral';
        const regs = Array.isArray(p.tags?.register) ? p.tags.register : [p.tags?.register];
        if (regs.some((r: string) => r?.toLowerCase().includes('formal'))) register = 'formal';
        else if (regs.some((r: string) => r?.toLowerCase().includes('slang') || r?.toLowerCase().includes('casual'))) register = 'casual';

        // Normalize Social Distance
        let distance = 'neutral';
        const dists = Array.isArray(p.tags?.socialDistance) ? p.tags.socialDistance : [p.tags?.socialDistance];
        if (dists.some((d: string) => d?.toLowerCase().includes('intimate'))) distance = 'intimate';
        else if (dists.some((d: string) => d?.toLowerCase().includes('professional') || d?.toLowerCase().includes('hierarchical'))) distance = 'professional';

        // C. Key Generation (The "Bucket") - Now includes Subtopic
        const key = subtopic
            ? `${topic}::${subtopic}::${register}::${distance}`
            : `${topic}::${register}::${distance}`;

        // Display topic includes subtopic if present
        const displayTopic = subtopic ? `${topic} (${subtopic})` : topic;

        if (!groups.has(key)) {
            groups.set(key, {
                id: key,
                topic: displayTopic,
                register,
                socialDistance: distance,
                phrases: []
            });
        }
        groups.get(key)!.phrases.push(p);
    });

    // Post-process: Split large groups (Max 6)
    const finalGroups: PhraseGroup[] = [];
    groups.forEach(group => {
        if (group.phrases.length <= 6) {
            finalGroups.push(group);
        } else {
            // Split into chunks of 5
            const chunkSize = 5;
            for (let i = 0; i < group.phrases.length; i += chunkSize) {
                const chunk = group.phrases.slice(i, i + chunkSize);
                finalGroups.push({
                    ...group,
                    id: `${group.id}-part${Math.floor(i / chunkSize) + 1}`,
                    topic: `${group.topic} (Part ${Math.floor(i / chunkSize) + 1})`,
                    phrases: chunk
                });
            }
        }
    });

    return finalGroups;
}

// --------------------------------------------------------------------------
// 3. AI LABELING LOGIC
// --------------------------------------------------------------------------
async function labelClustersWithAI(groups: PhraseGroup[], userEmail: string, userId: string) {
    // We send the groups to AI purely for creative labeling
    const groupsPayload = groups.map((g, index) => ({
        index,
        core_topic: g.topic,
        pragmatics: `${g.register} / ${g.socialDistance}`,
        words: g.phrases.map(p => p.phrase)
    }));

    const prompt = `You name vocabulary clusters like chapter titles in a short story collection.

INPUT DATA:
${JSON.stringify(groupsPayload, null, 2)}

## YOUR TASK
For each pre-grouped cluster, write a creative Theme (title) and Context (scenario description).

## RULES
1. **Respect the Grouping**: Do NOT move words between groups.
2. **Theme**: ≤5 words. Should feel like a book chapter title — evocative, specific, not generic.
3. **Context**: 1-2 sentences. A specific scenario, not a category. Include who, where, and what's at stake.
4. **Pragmatics**: Match the register (Formal → professional setting, Casual → friends/social).
5. **Multi-Scene**: If >5 words, suggest a "Multi-Scene Arc" (e.g., "Scene 1: The Incident → Scene 2: The Fallout").

## ❌ BAD THEMES (generic, category-like)
- "Business" → Too vague, sounds like a textbook chapter
- "Daily Conversation" → Every conversation is daily
- "Social Situations" → Meaningless label

## ✅ GOOD THEMES (evocative, specific)
- "The Elevator Pitch Gone Wrong" → You can picture it
- "Roommates at Breaking Point" → Tension, relationship, stakes
- "First Day, Wrong Coffee Order" → Specific, relatable, memorable

## EXAMPLES

Input: { "core_topic": "workplace disagreement", "pragmatics": "Formal / distant", "words": ["push back", "compromise", "see eye to eye"] }
Output: { "theme": "The Budget Meeting Standoff", "context": "Two department heads clash over next quarter's budget allocation. Neither wants to back down, but the CEO is watching.", "pragmatics": { "register": "Formal", "relationship": "distant" } }

Input: { "core_topic": "weekend plans", "pragmatics": "Casual / close", "words": ["rain check", "up for it", "call it a night"] }
Output: { "theme": "Saturday Plans, Sunday Regrets", "context": "A group chat spirals as friends try to coordinate weekend plans — someone always bails, someone always overcommits.", "pragmatics": { "register": "Casual", "relationship": "close" } }

## OUTPUT JSON
{
  "clusters": [
    {
      "groupIndex": 0,
      "theme": "Theme ≤5 words",
      "context": "1-2 sentence scenario",
      "pragmatics": { "register": "matching_input", "relationship": "matching_input" }
    }
  ]
}
`;

    const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: 'You are a creative writing instructor who names scenarios like short story chapters. Respond ONLY in valid JSON.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        console.error('DeepSeek Labeling Failed:', await response.text());
        return groups; // Fallback to raw groups
    }

    const data = await response.json();

    let aiResults: any[] = [];
    try {
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid AI response structure');
        }
        const parsed = JSON.parse(data.choices[0].message.content);
        aiResults = parsed.clusters || [];
    } catch (e) {
        console.error('AI Parse Error', e);
        // Fallback: return unlabeled groups
    }

    // Merge AI metadata back into groups
    return groups.map((g, i) => {
        const meta = aiResults.find(r => r.groupIndex === i);

        // Compute dominant skill from phrase characteristics
        let skill = 'Contextual Usage'; // default
        const registers = g.phrases.map(p => {
            const regs = Array.isArray(p.tags?.register) ? p.tags.register : [p.tags?.register || 'neutral'];
            return regs.map((r: string) => r?.toLowerCase());
        }).flat();
        const uniqueRegisters = new Set(registers.filter(Boolean));
        const avgStep = g.phrases.reduce((sum: number, p: any) => sum + (p.learningStep || 0), 0) / (g.phrases.length || 1);

        if (uniqueRegisters.size >= 2 && !(uniqueRegisters.size === 1 && uniqueRegisters.has('neutral'))) {
            skill = 'Register Awareness';
        } else if (g.socialDistance === 'professional' || g.socialDistance === 'intimate') {
            skill = 'Pragmatic Reasoning';
        } else if (avgStep >= 5) {
            skill = 'Active Recall';
        } else if (avgStep >= 3) {
            skill = 'Error Analysis';
        }

        return {
            id: g.id,
            theme: meta?.theme || `${g.topic} Practice`,
            skill,
            context: meta?.context || `Reviewing ${g.topic} words.`,
            pragmatics: {
                register: g.register,
                relationship: g.socialDistance
            },
            phraseIds: g.phrases.map(p => p.id),
            phrases: g.phrases // Return full objects for frontend display/counting
        };
    });
}

// --------------------------------------------------------------------------
// HEURISTIC LOGIC (Fallback)
// --------------------------------------------------------------------------
function simpleHeuristicClustering(phrases: any[]) {
    // Simple greedy clustering by Topic tag overlap
    const clusters: any[] = [];
    const unclustered = [...phrases];

    while (unclustered.length > 0) {
        const seed = unclustered.pop();
        if (!seed) break;

        const cluster = [seed];
        // Safely access topics with optional chaining defaults
        const seedTopics: string[] = seed.tags?.topics || [];

        // Find friends
        for (let i = unclustered.length - 1; i >= 0; i--) {
            const candidate = unclustered[i];
            const candidateTopics: string[] = candidate.tags?.topics || [];

            // Check overlap
            const overlap = seedTopics.some((t: string) => candidateTopics.includes(t));

            // STRICTER OVERLAP for small sets
            // Only group if there is actual topic overlap.
            if (overlap) {
                cluster.push(candidate);
                unclustered.splice(i, 1);
            }

            if (cluster.length >= 4) break;
        }

        clusters.push({
            theme: seedTopics[0] || 'General Review',
            context: 'A practice session reviewing mixed topics.',
            pragmatics: { register: 'neutral', relationship: 'neutral' },
            phraseIds: cluster.map(p => p.id),
            phrases: cluster // Return full objects for frontend display/counting
        });
    }

    return clusters;
}
