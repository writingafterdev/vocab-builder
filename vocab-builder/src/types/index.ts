// User Profile
export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    username: string;
    bio: string;
    photoURL: string;
    role: 'user' | 'admin';
    createdAt: Date;
    lastActiveAt: Date;
    stats: UserStats;
    subscription: Subscription;
    settings: UserSettings;
}

export interface UserStats {
    totalPhrases: number;
    totalComments: number;
    totalReposts: number;
    currentStreak: number;
    longestStreak: number;
    lastStudyDate: Date | null;
}

export interface Subscription {
    status: 'trial' | 'active' | 'expired' | 'cancelled';
    plan: 'monthly' | 'yearly' | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    paymentProvider?: 'momo' | 'zalopay' | 'stripe';
}

export interface UserSettings {
    dailyGoal: number;
    preferredStyles: string[];
    notificationsEnabled: boolean;
}

// Phrases

// Context for contextualized learning
export interface PhraseContext {
    id: string;              // e.g., "workplace", "family", "education"
    name: string;            // "Workplace & Teams"
    question: string;        // Contextualized exercise question
    unlocked: boolean;       // Available for practice
    masteryLevel: number;    // 0-3 (new → learning → familiar → mastered)
    lastPracticed?: Date;
}

export interface Phrase {
    id: string;
    userId: string;
    phrase: string;
    phraseLower: string;
    context: string;         // Original context where phrase was found
    sourceId: string;
    meaning: string;
    usage?: 'spoken' | 'written' | 'neutral';
    createdAt: Date;
    // Spaced Repetition
    showCount: number;
    nextShowAt: Date;
    lastShownAt: Date | null;
    retired: boolean;
    // Contextualized Learning
    contexts: PhraseContext[];      // Multiple learning contexts
    currentContextIndex: number;    // Which context is active
}

// Speaking Chunks (for Read & Speak mode)
export interface SpeakingChunk {
    text: string;
    audioUrl?: string;      // Firebase Storage URL (cached TTS)
    generatedAt?: number;   // Timestamp when audio was generated
}

// Posts
export interface Post {
    id: string;
    userId: string;
    authorId: string;
    type: 'ai' | 'admin' | 'repost';
    originalPostId: string | null;
    phraseIds: string[];
    phrases: string[];
    postContent: string;
    postStyle: 'twitter' | 'instagram' | 'linkedin' | 'reddit';
    aiPersona: AIPersona | null;
    createdAt: Date;
    scheduledFor: Date;
    status: 'pending' | 'shown' | 'completed';
    commentCount: number;
    repostCount: number;
    engagement: PostEngagement;
    task: PostTask | null;
    // Speaking mode chunks with cached TTS
    speakingChunks?: SpeakingChunk[];
}

export interface AIPersona {
    name: string;
    avatar: string;
}

export interface PostEngagement {
    seen: boolean;
    seenAt: Date | null;
    commented: boolean;
    commentedAt: Date | null;
}

export interface PostTask {
    phrase: string;
    prompt: string;
}

// Comments
export interface Comment {
    id: string;
    postId: string;
    userId: string;
    parentId: string | null;
    content: string;
    createdAt: Date;
    likeCount: number;
    replyCount: number;
    usedPhrase: boolean;
}

// Reading Materials
export interface ReadingMaterial {
    id: string;
    title: string;
    content: string;
    category: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    createdBy: string;
    createdAt: Date;
    isPublished: boolean;
    readCount: number;
    phrasesSavedCount: number;
}

// Spaced Repetition Config
export interface SpacedRepetitionConfig {
    intervals: number[];
    maxShows: number;
    updatedAt: Date;
}
