/**
 * Shared types for database modules
 */
import { Timestamp } from 'firebase/firestore';

export interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorPhotoURL?: string;
    source?: string;
    content: string;
    highlightedPhrases: string[];
    type: 'admin' | 'ai' | 'user';
    isArticle?: boolean;
    title?: string;
    coverImage?: string;
    translatedTitle?: string;
    translatedContent?: string;
    caption?: string; // Author's intro/thoughts about the article
    commentCount: number;
    repostCount: number;
    generatedForUserId?: string | null; // For AI-generated posts - only show to this user
    originalUrl?: string; // Original source URL
    createdAt: Timestamp;
}

export interface Comment {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorPhotoURL?: string;
    content: string;
    likeCount: number;
    replyCount: number;
    parentId?: string;
    createdAt: Timestamp;
}

export interface Repost {
    id: string;
    postId: string;
    userId: string;
    createdAt: Timestamp;
}

export interface Like {
    id: string;
    commentId: string;
    userId: string;
    createdAt: Timestamp;
}

// Context for contextualized learning
export interface PhraseContext {
    id: string;              // e.g., "workplace", "family", "education"
    name: string;            // "Workplace & Teams"
    question: string;        // Contextualized exercise question
    unlocked: boolean;       // Available for practice
    masteryLevel: number;    // 0-3 (new → learning → familiar → mastered)
    lastPracticed?: Timestamp;
}

export interface SavedPhrase {
    id: string;
    userId: string;
    phrase: string;
    meaning: string;
    context: string;         // Original context where phrase was found
    usage?: 'spoken' | 'written' | 'neutral';  // Register/mode for debate style
    sourcePostId?: string;
    usedForGeneration: boolean;
    usageCount?: number;     // SRS usage count (scheduled reviews)
    practiceCount?: number;  // On-demand practice count (from vocab page)
    createdAt: Timestamp;
    learningStep: number;
    nextReviewDate: Timestamp;
    lastReviewDate?: Timestamp;
    // Contextualized Learning
    contexts: PhraseContext[];      // Multiple learning contexts
    currentContextIndex: number;    // Which context is active (default: 0)
    // Collocation & Tagging
    rootWord?: string;              // Base word for grouping variants (e.g., "book" for "book a flight")
    topics?: string[];              // Auto-tagged topics: travel, business, crime, etc.
    // Hierarchical Structure (NEW)
    children?: ChildExpression[];   // Child collocations and phrasal verbs
}

// Child expression (collocation or phrasal verb) nested under a root phrase
export interface ChildExpression {
    type: 'collocation' | 'phrasal_verb';
    phrase: string;
    meaning: string;
    example: string;  // AI-generated example sentence
    mode: 'spoken' | 'written' | 'neutral';
    topics: string[];
}

// Bundled exercise for practice sessions
export interface ExerciseBundle {
    id: string;
    theme: string;                  // "Workplace Dynamics"
    question: string;               // Contextualized question
    phraseIds: string[];            // Phrase document IDs
    phrases: string[];              // Actual phrase text
    contextIds: string[];           // Which context per phrase
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    createdAt: Timestamp;
}

export interface LearningCycleSettings {
    intervals: number[];
    masteryThreshold: number;
    levelNames: string[];
}

export const DEFAULT_LEARNING_CYCLE: LearningCycleSettings = {
    intervals: [1, 3, 7, 14, 30, 90],
    masteryThreshold: 6,
    levelNames: ['New', 'Learning', 'Review', 'Familiar', 'Known', 'Mastered'],
};

// User-selectable topics for phrase tagging
export const TOPIC_OPTIONS = [
    // Work & Career
    { value: 'business', label: 'Business' },
    { value: 'career', label: 'Career' },
    { value: 'finance', label: 'Finance' },
    // Learning & Knowledge
    { value: 'academic', label: 'Academic' },
    { value: 'science', label: 'Science' },
    { value: 'education', label: 'Education' },
    // Life & Relationships
    { value: 'daily_life', label: 'Daily Life' },
    { value: 'relationships', label: 'Relationships' },
    { value: 'family', label: 'Family' },
    // Leisure & Activities
    { value: 'travel', label: 'Travel' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'sports', label: 'Sports' },
    // Tech & Media
    { value: 'technology', label: 'Technology' },
    { value: 'media', label: 'Media' },
    // Well-being & World
    { value: 'health', label: 'Health' },
    { value: 'environment', label: 'Environment' },
    // Society
    { value: 'politics', label: 'Politics' },
    { value: 'culture', label: 'Culture' },
] as const;

export type TopicValue = typeof TOPIC_OPTIONS[number]['value'];

// Legacy export for backward compatibility
export const VALID_TOPICS = TOPIC_OPTIONS.map(t => t.value);
export type TopicTag = TopicValue;

// Guided Debate Mode types
export interface DebatePhrase {
    phrase: string;
    phraseId: string;
    meaning: string;
    used: boolean;
    turnUsedIn: number | null;
    status: 'natural' | 'forced' | 'missing' | 'pending';
    feedback: string;
}

export interface DebateTurn {
    turnNumber: number;              // 1, 2, 3
    userMessage: string;
    phrasesUsedThisTurn: string[];
    opponentResponse: string;
    timestamp: Timestamp | Date | string;  // Support REST API format
}

export interface DebateSession {
    id: string;
    userId: string;
    topic: string;
    topicAngle: string;              // workplace, family, education, etc.
    backgroundContent: string;        // Passive learning content
    phrases: DebatePhrase[];          // Target phrases (3-5)
    opponentPersona: string;          // "Alex, Devil's Advocate"
    opponentPosition: string;         // Opening argument
    turns: DebateTurn[];              // Max 3
    status: 'active' | 'completed' | 'abandoned';
    isScheduled: boolean;             // true = from /practice (SRS), false = from /vocab (on-demand)
    mode?: 'spoken' | 'written' | 'neutral'; // Debate tone
    createdAt: Timestamp;
    completedAt?: Timestamp;
}

// Token usage tracking for admin analytics
export interface TokenUsage {
    id: string;
    userId: string;
    userEmail: string;
    endpoint: string;           // e.g., "generate-meaning", "debate-turn"
    model: string;              // "deepseek-chat" or "gemini-3-flash"
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: Timestamp;
}

