/**
 * AI Prompt Templates
 * 
 * Centralized location for all AI generation prompts.
 * This keeps the API routes clean and makes prompts easier to iterate on.
 */

// ============ COMMENTER PERSONAS ============

export const COMMENTER_POOL = [
    { name: 'Alex', style: 'analytical and thoughtful' },
    { name: 'Maya', style: 'supportive and encouraging' },
    { name: 'Chris', style: 'witty and sarcastic' },
    { name: 'Jordan', style: 'enthusiastic and expressive' },
    { name: 'Sam', style: 'casual and relatable' },
    { name: 'Taylor', style: 'curious and questioning' },
    { name: 'Riley', style: 'humorous and playful' },
    { name: 'Casey', style: 'insightful and deep' },
] as const;

// ============ CONTENT STYLES ============

export const POST_STYLES = [
    'witty observation',
    'hot take',
    'personal story',
    'life lesson',
    'relatable moment',
    'unpopular opinion',
] as const;

export const ARTICLE_STYLES = [
    'practical guide',
    'personal essay',
    'opinion piece',
    'storytelling',
    'how-to',
] as const;

// ============ PROMPT BUILDERS ============

interface PromptContext {
    phrasesList: string;
    style: string;
    numComments: number;
    commentersList: string;
    commentersJson: string;
}

export function buildPostPrompt(ctx: PromptContext): string {
    return `Write a short, punchy X (Twitter) style post using these phrases: ${ctx.phrasesList}.

STYLE REQUIREMENTS:
- Keep it SHORT (1-3 sentences max, under 280 characters preferred)
- ${ctx.style} vibe
- Casual, conversational tone like a real tweet
- Can use line breaks for impact
- Can include rhetorical questions or observations
- NO hashtags, NO emojis unless natural
- NEVER use em dashes (— or --). Use commas, periods, or "and" instead.

Use the phrases naturally. Make it feel authentic, like a real person tweeted it.

ALSO generate ${ctx.numComments} X/Reddit style reply comments from: ${ctx.commentersList}

COMMENT STYLE (like real X/Reddit):
- SHORT (1 sentence preferred, max 2)
- Casual internet voice - can be sarcastic, supportive, funny, or relatable
- Can use "lol", "this", "fr", "ngl", "honestly", "literally me", etc.
- Some might quote the post, some might add their take
- Vary between agreement, jokes, questions, and personal stories
- Match each commenter's personality

Return JSON: {"content":"your tweet","comments":[${ctx.commentersJson}],"usedPhrases":["phrase1"]}`;
}

export function buildArticlePrompt(ctx: PromptContext): string {
    return `Write a ${ctx.style} article using these phrases: ${ctx.phrasesList}.
IMPORTANT: The article content MUST be at least 1200 characters long (about 5-6 paragraphs).
Style: ${ctx.style} - be creative and thorough!
NEVER use em dashes (— or --). Use commas, periods, "and", or semicolons instead.

Include a catchy title. Use ALL phrases naturally.

ALSO generate ${ctx.numComments} Reddit-style comments from: ${ctx.commentersList}

COMMENT STYLE (like real Reddit):
- Thoughtful but casual (1-3 sentences)
- Can share personal experiences, add insights, or ask questions
- Some might be supportive, some might debate a point
- Natural internet voice - not formal
- Match each commenter's personality

Return JSON: {"title":"Your Title","content":"Long article text (1200+ characters)","comments":[${ctx.commentersJson}],"usedPhrases":["phrase1"]}`;
}

export function buildPostWithCommentsPrompt(ctx: PromptContext): string {
    return `Write a casual social media post using these phrases: ${ctx.phrasesList}.

STYLE:
- Medium length (2-4 sentences)
- ${ctx.style} vibe
- Conversational and engaging
- Should invite responses/discussion

ALSO generate ${ctx.numComments} engaging reply comments from: ${ctx.commentersList}

COMMENT STYLE:
- Natural social media replies
- Mix of agreement, jokes, questions, personal takes
- Match each commenter's personality

Return JSON: {"content":"your post","comments":[${ctx.commentersJson}],"usedPhrases":["phrase1"]}`;
}

// ============ HELPERS ============

export function selectRandomCommenters(count: number) {
    const shuffled = [...COMMENTER_POOL].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export function getRandomStyle(styles: readonly string[]): string {
    return styles[Math.floor(Math.random() * styles.length)];
}
