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
    // Gamification
    xp: number;                    // Total XP earned
    level: number;                 // Current level
    xpToday: number;              // XP earned today (for daily cap)
    xpTodayDate: string | null;   // Date string for xpToday reset
    redeemedDays: number;         // Total premium days redeemed
}

export interface Subscription {
    status: 'trial' | 'active' | 'expired' | 'cancelled';
    plan: 'monthly' | 'yearly' | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    paymentProvider?: 'momo' | 'zalopay' | 'stripe' | 'xp_redeem';
}

export interface UserSettings {
    dailyGoal: number;
    preferredStyles: string[];
    notificationsEnabled: boolean;
}

// Gamification - XP System
export type XpSource =
    | 'daily_drill_complete'
    | 'reading_session_complete'
    | 'listening_session_complete'
    | 'speaking_chunk_complete'
    | 'phrase_saved'
    | 'streak_bonus'
    | 'perfect_score_bonus'
    | 'redeem_premium';

export interface XpTransaction {
    id: string;
    userId: string;
    amount: number;           // +50 or -500
    type: 'earn' | 'redeem';
    source: XpSource;
    createdAt: Date;
    metadata?: {
        sessionId?: string;
        score?: number;
        streakDays?: number;
        daysRedeemed?: number;
    };
}

// XP configuration
export const XP_CONFIG = {
    // Base rewards
    PHRASE_SAVED: 5,
    DAILY_DRILL: 20,
    READING_SESSION: 25,
    LISTENING_SESSION: 25,
    SPEAKING_CHUNK: 15,
    STREAK_MULTIPLIER: 10,  // 10 * streak days
    STREAK_CAP: 100,

    // Bonus thresholds
    PERFECT_THRESHOLD: 90,
    PERFECT_BONUS: 10,
    SUPER_PERFECT_THRESHOLD: 95,
    SUPER_PERFECT_BONUS: 15,

    // Daily caps
    DAILY_CAP_SESSIONS: 150,
    DAILY_CAP_PHRASES: 50,
    DAILY_CAP_STREAK: 100,
    DAILY_CAP_TOTAL: 300,

    // Redemption rates (XP cost -> days)
    REDEEM_1_DAY: 500,
    REDEEM_7_DAYS: 3000,
    REDEEM_30_DAYS: 10000,

    // Level calculation (XP required per level)
    XP_PER_LEVEL: 100,
} as const;

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
