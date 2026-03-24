/**
 * Shared types for database modules
 */
import { Timestamp } from '@/lib/appwrite/firestore';

// ============================================================================
// REDDIT CONTENT TYPES
// ============================================================================

// Reddit comment with hierarchical structure
export interface RedditComment {
    id: string;
    author: string;
    body: string;
    bodyHtml?: string;  // With highlighted phrases
    upvotes: number;
    createdAt: Date | Timestamp;
    children: RedditComment[];  // Nested replies
    phraseData?: ExtractedPhrase[];  // Phrases in this comment
}

// ============================================================================
// POST / ARTICLE TYPES
// ============================================================================

export interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorPhotoURL?: string;
    source?: string;
    content: string;
    highlightedPhrases: string[];
    phraseData?: ExtractedPhrase[]; // Extracted phrases with meanings
    sentences?: SentencePair[]; // Sentence-by-sentence translations
    // Pre-built vocabulary data (keyed by lowercase phrase/word)
    vocabularyData?: Record<string, {
        phrase: string;
        phonetic?: string;
        partOfSpeech: string;
        meaning: string;
        meaningVi?: string;
        example?: string;
        isHighFrequency: boolean;
        register?: Register;
        nuance?: Nuance;
        topic?: string;
        subtopic?: string;
        words?: Array<{
            word: string;
            meaning: string;
            partOfSpeech: string;
            isHighFrequency: boolean;
        }>;
        commonUsages?: Array<{
            phrase: string;
            meaning: string;
            example?: string;
            type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
        }>;
    }>;
    vocabProcessingStatus?: 'pending' | 'processing' | 'complete' | 'failed';
    vocabProcessedAt?: Timestamp;
    type: 'admin' | 'ai' | 'user';
    isArticle?: boolean;
    title?: string;
    coverImage?: string;
    caption?: string; // Author's intro/thoughts about the article
    commentCount: number;
    repostCount: number;
    generatedForUserId?: string | null; // For AI-generated posts - only show to this user
    originalUrl?: string; // Original source URL
    createdAt: Timestamp;
    // Leveled reading content (Newsela/CommonLit style)
    levels?: Partial<Record<LexileLevel, LevelVersion>>;

    // Reddit-specific fields
    contentSource?: 'article' | 'reddit';  // Type of content
    subreddit?: string;  // e.g., "AskReddit"
    redditUrl?: string;  // Original Reddit post URL
    redditComments?: RedditComment[];  // Hierarchical comments

    // Lexile versions (easy, medium, hard) - preserves tone/nuance
    lexileVersions?: {
        easy: string;   // Lexile 600-800
        medium: string; // Lexile 900-1100
        hard: string;   // Lexile 1200+
    };

    // Topic-specific vocabulary (single words)
    topicVocab?: TopicVocabItem[];

    // Reading level assessment
    lexileLevel?: 'easy' | 'medium' | 'hard';
    lexileScore?: number;

    // Audio for article (TTS)
    audioUrl?: string;
    audioGeneratedAt?: Timestamp;

    // Article reading sections (AI-divided for swipe mode)
    subtitle?: string;
    sections?: ArticleSection[];
}

// AI-divided article section for swipe reading mode
export interface ArticleSection {
    id: string;
    title?: string;           // Optional section heading
    content: string;          // HTML content for this section
    vocabPhrases: string[];   // Phrases to highlight in this section
}

// Topic vocabulary item (single word or phrase, domain-specific)
export interface TopicVocabItem {
    word: string;
    meaning: string;
    partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';
    topic: string;
    frequency: 'common' | 'intermediate' | 'advanced';
    example?: string;
}


// Sentence pair for article translations
export interface SentencePair {
    en: string; // English sentence
    vi: string; // Vietnamese translation
}

// Register: formality level of language
export type Register = 'casual' | 'consultative' | 'formal';

// Nuance: sentiment/connotation of language
export type Nuance = 'positive' | 'slightly_positive' | 'neutral' | 'slightly_negative' | 'negative';

// Social Distance: relationship context for natural language use
// A phrase can belong to multiple contexts if natural in those situations
export type SocialDistance =
    | 'close'              // Family, best friends, partner
    | 'friendly'           // Friends, acquaintances, classmates
    | 'neutral'            // Strangers, general public, service contexts
    | 'hierarchical_up'    // Speaking to authority (boss, teacher, client)
    | 'hierarchical_down'  // Speaking to subordinates
    | 'hierarchical_peer'  // Same-level colleagues
    | 'professional';      // Business/formal contexts

// ============================================================================
// LEVELED READING + EMBEDDED QUESTIONS
// ============================================================================

// Lexile/CEFR reading levels
export type LexileLevel = 'A1' | 'A2' | 'B1' | 'B2';

// Passive exercise question types (vocab-focused through story comprehension)
// Questions test vocabulary indirectly by asking about narrative, not words
export type QuestionType =
    | 'character_motivation'   // Why people act/react (nuance + context)
    | 'outcome_consequence'    // Cause-effect chains (collocations)
    | 'problem_identification' // Central conflict (multiple root words)
    | 'turning_point'          // Story direction change (phrases)
    | 'tone_mood_shift'        // Atmosphere changes (register + nuance)
    | 'relationship_dynamics'  // Social interactions (register awareness)
    | 'attitude_reading'       // Inferring feelings (connotation)
    | 'decision_reasoning'     // Why choices made (vocab in logic)
    | 'communication_intent'   // Speaker's goal (social tact)
    | 'detail_tracking'        // Specific info (factual context)
    | 'comparison_contrast'    // Similar situations (near-synonyms)
    | 'gap_inference'          // Predicting missing info (context)
    | 'perspective_analysis';  // Different viewpoints (register + nuance)

// Active exercise scenario types (role-play production)
// User produces vocabulary naturally through authentic communication challenges
export type ActiveScenarioType =
    | 'real_dilemma'          // Handle authentic communication challenge (2-3 phrases)
    | 'social_navigation'     // Adjust for audience/context (1-2 phrases, correct register)
    | 'conflict_resolution'   // Manage disagreement diplomatically (2-3 phrases with nuance)
    | 'advice_giving'         // Share expertise/guidance (2-3 phrases, collocations)
    | 'expectation_management' // Balance competing concerns (3-4 phrases diplomatic)
    | 'code_switching'        // Adapt same content for different audiences (2-3 phrases, 2 registers)
    | 'narrative_building'    // Tell a personal story (3-4 phrases in storytelling)
    | 'persuasive_strategy'   // Convince while acknowledging POV (3-4 phrases strategic)
    | 'problem_solving'       // Find communication solution (2-4 phrases serving goal)
    | 'multi_turn';           // Natural flow across exchanges (3-5 phrases across turns)

// Embedded question shown during reading/listening
export interface EmbeddedQuestion {
    id: string;
    type: QuestionType;
    question: string;
    options: string[];
    correctIndex: number;           // 0-3
    afterParagraph: number;         // Show after which paragraph (1-indexed)
    explanation?: string;           // Shown after answering
    vocabItemsTested?: string[];    // Phrases this question tests (for tracking)
}

// Content version for a specific level
export interface LevelVersion {
    content: string;                  // Article text at this level
    vocabularyData?: Record<string, {
        phrase: string;
        phonetic?: string;
        partOfSpeech: string;
        meaning: string;
        meaningVi?: string;
        example?: string;
        isHighFrequency: boolean;
        register?: Register;
        nuance?: Nuance;
        topic?: string;
        subtopic?: string;
    }>;
    embeddedQuestions: EmbeddedQuestion[];
}

// Extracted phrase with prebuilt data (from AI processing)
export interface ExtractedPhrase {
    phrase: string;
    meaning: string;
    sentenceIndex?: number; // Index of sentence containing this phrase
    register?: Register; // Formality level (was: mode)
    nuance?: Nuance; // Sentiment (new)
    topics?: string[];
    topic?: string; // Primary topic (for conditional highlighting)
    subtopic?: string;
    isHighFrequency?: boolean; // True for generic high-freq words
    commonUsages?: CommonUsage[];
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
    // Multi-value tags (arrays for naturalness - a phrase can fit multiple contexts)
    register?: Register | Register[];     // Formality levels where natural
    nuance?: Nuance | Nuance[];          // Sentiments/connotations
    socialDistance?: SocialDistance[];   // Relationship contexts where natural (NEW)
    sourcePostId?: string;
    usedForGeneration: boolean;
    usageCount?: number;     // SRS usage count (scheduled reviews)
    practiceCount?: number;  // On-demand practice count (from vocab page)
    createdAt: Timestamp;
    learningStep: number;
    layer?: 0 | 1 | 2;       // Explicit layer tracking (0=Root, 1=Child, etc.)
    nextReviewDate: Timestamp;
    lastReviewDate?: Timestamp;

    // ====== INLINE EXERCISE SYSTEM (Blended Learning) ======
    // Tracks which question formats have been used for round-robin variety
    completedFormats?: ExerciseQuestionType[];
    // Last surface where this phrase was reviewed (for analytics)
    lastReviewSource?: ExerciseSurface;
    // Prevents double-serving across surfaces on the same day
    lastReviewedAt?: Timestamp;
    // Phrases that failed inline get escalated to exercises page
    failedInline?: boolean;

    // Context Rotation Cache
    lastPracticeConfig?: {
        register: Register;
        relationship: SocialDistance;
        topic: string;
    };

    // Pronunciation data from dictionary API
    audioUrl?: string;       // URL to audio file for pronunciation
    phonetic?: string;       // IPA phonetic transcription
    // Contextualized Learning
    contexts: PhraseContext[];      // Multiple learning contexts
    currentContextIndex: number;    // Which context is active (default: 0)
    // Collocation & Tagging
    rootWord?: string;              // Base word for grouping variants (e.g., "book" for "book a flight")
    topic?: string | string[];      // Topic(s) where phrase is used
    subtopic?: string | string[];   // Subtopic(s)
    topics?: string[];              // Legacy: flat array of topics (backward compat)
    // Common Usages (NEW - unified approach)
    commonUsages?: CommonUsage[];   // Context-aware related expressions

    // Layer 1 Children - Silent metadata for exercise generation (1 layer deep)
    // TWO TYPES (Layer 1 only):
    // - 'usage': Common collocations/phrases using this word
    // - 'connotation': Same meaning but different sentiment/emotional tone
    //
    // CASCADING SYSTEM:
    // - Layer 0 (Root) → Layer 1: generates BOTH usages AND connotations
    // - Layer 1+ (if isSingleWord) → Layer 2+: generates ONLY usages (no connotations)
    // - Each layer becomes independent SavedPhrase with own tags + SRS schedule
    potentialUsages?: Array<{
        phrase: string;
        meaning: string;
        type: 'usage' | 'connotation';            // 'connotation' only exists at Layer 1
        isSingleWord?: boolean;                    // If true, triggers next layer (usages only)
        exposed?: boolean;                         // True once promoted to independent SavedPhrase
    }>;
    // Legacy: keep for backward compatibility with existing data
    children?: ChildExpression[];   // Old: Child collocations and phrasal verbs

    // Guided Practice: Encounter Tracking
    encounteredVariants?: {
        phrase: string;
        encounteredAt: Timestamp;
        source: 'reading' | 'practice';
    }[];

    // Linked Variants: Separate phrases connected as variants
    linkedVariants?: {
        phraseId: string;  // ID of the linked SavedPhrase
        relationship: 'register_variant' | 'nuance_variant' | 'synonym';
    }[];

    // Hierarchical Linking (Flat Storage + Hierarchical View)
    parentPhraseId?: string;     // ID of immediate parent phrase (for hierarchy)
    childPhraseIds?: string[];   // IDs of child phrases (SavedPhrase IDs)
    hasAppearedInExercise?: boolean; // True once this variant has been used in generated content

    // Root phrase ID (if this phrase is a variant of another) - legacy
    rootPhraseId?: string;

    // Cascading Trigger System: Locked Children to Unlock on Practice
    lockedChildIds?: string[];   // IDs of children still locked
    isUnlocked?: boolean;        // False = locked (hidden from user)

    // Context Rotation: Track which contexts have been used for this phrase
    practiceHistory?: {
        usedContexts: Array<{
            topic: string;
            register: string;
            timestamp: Date | string;
        }>;
    };

    // Weekly Live Session Tracking
    // Used to gate progression at Step 3 - phrases must pass live conversation test
    liveSessionStatus?: 'not_ready' | 'pending' | 'passed' | 'failed';

    // Passive Exposure Tracking (Reading, Listening, Live Sessions)
    // Used by phrase selection algorithm to prioritize least-exposed phrases
    passiveExposure?: PassiveExposure;
}

// Passive exposure tracking for phrase selection algorithm
export interface PassiveExposure {
    readingSessionCount: number;      // Times appeared in reading sessions
    listeningSessionCount: number;    // Times appeared in listening sessions
    liveSessionCount: number;         // Times appeared in live sessions
    openEndedSessionCount: number;    // Times appeared in open-ended sessions
    turnBasedSessionCount: number;    // Times appeared in turn-based chat
    lastReadingDate?: Timestamp;      // Last included in reading session
    lastListeningDate?: Timestamp;    // Last included in listening session
    lastLiveSessionDate?: Timestamp;  // Last included in live session
    lastOpenEndedDate?: Timestamp;    // Last included in open-ended
    lastTurnBasedDate?: Timestamp;    // Last included in turn-based
}

// ============================================================================
// OPEN-ENDED GUIDED QUESTIONS
// ============================================================================

export interface GuidedQuestion {
    id: string;
    text: string;                    // The open-ended question
    targetPhraseIds: string[];       // Phrases this question expects user to use
    isFollowUp: boolean;             // Is this a follow-up question?
    parentQuestionId?: string;       // If follow-up, which question it follows
}

export interface OpenEndedUserResponse {
    questionId: string;
    transcript: string;              // User's spoken response (STT)
    audioUrl?: string;               // Recorded audio file
    phrasesDetected: string[];       // Which target phrases were used
    timestamp: Timestamp;
}

export interface OpenEndedSession {
    id?: string;
    userId: string;
    phraseIds: string[];             // All due phrases tested
    questions: GuidedQuestion[];     // Pre-generated question tree
    responses: OpenEndedUserResponse[];
    startedAt: Timestamp;
    completedAt?: Timestamp;
    phrasesUsed: string[];           // Phrases successfully used (for SRS)
    phrasesMissed: string[];         // Phrases not used (no SRS change)
}

// ============================================================================
// TURN-BASED VOICE CHAT
// ============================================================================

export interface ChatTurn {
    role: 'ai' | 'user';
    text: string;
    audioUrl?: string;
    targetPhrases?: string[];        // Phrases AI is trying to elicit (ai turn only)
    phrasesDetected?: string[];      // Phrases user used (user turn only)
    timestamp: Timestamp;
}

export interface TurnBasedSession {
    id?: string;
    userId: string;
    phraseIds: string[];             // Target phrases for conversation
    turns: ChatTurn[];
    voiceId: string;                 // Random Gemini voice used
    startedAt: Timestamp;
    completedAt?: Timestamp;
    phrasesUsed: string[];           // Phrases successfully used (for SRS)
    phrasesMissed: string[];         // Phrases not used (no SRS change)
}

// User milestone tracking for unlocking reading/listening sessions
export interface UserMilestones {
    readingUnlockThreshold: number;    // Current threshold (starts at 15, +15 after each session)
    listeningUnlockThreshold: number;  // Current threshold (starts at 15, +15 after each session)
    lastReadingSessionDate?: Timestamp;
    lastListeningSessionDate?: Timestamp;
    totalReadingSessions: number;
    totalListeningSessions: number;

    // Open-Ended Guided Questions tracking
    lastOpenEndedDate?: Timestamp;
    totalOpenEndedSessions: number;

    // Turn-Based Voice Chat tracking
    openEndedSinceLastChat: number;    // Resets to 0 after each turn-based (3:1 ratio)
    lastTurnBasedDate?: Timestamp;
    totalTurnBasedSessions: number;
}

// Type tags for common usages
export type UsageType =
    | 'collocation'    // natural word pairings: "make a decision"
    | 'phrasal_verb'   // verb + particle: "break down", "give up"
    | 'idiom'          // non-literal fixed expression: "break the ice"
    | 'expression';    // common phrase/saying: "take a break"

// Common usage expression with context-aware meaning
export interface CommonUsage {
    phrase: string;              // "take a break"
    meaning: string;             // "to stop working temporarily"
    example: string;             // "Let's take a break and get some coffee."
    type: UsageType;             // "expression"
    register: Register;          // Formality level
    nuance: Nuance;              // Sentiment
    socialDistance?: SocialDistance | SocialDistance[]; // Relationship context
    topics: string[];
}

// Child expression (collocation, phrasal verb, idiom) - with independent SRS
export interface ChildExpression {
    id: string;                           // Unique ID for SRS tracking
    type: 'collocation' | 'phrasal_verb' | 'idiom' | 'expression';
    phrase: string;
    baseForm: string;                     // For duplicate detection
    meaning: string;
    example?: string;
    context: string;                      // Where user encountered it
    sourceType: 'article' | 'exercise';   // Origin of discovery

    // Independent metadata
    topic: string;
    subtopic?: string;
    register: Register;
    nuance: Nuance;
    socialDistance?: SocialDistance | SocialDistance[]; // Relationship context

    // Independent SRS (like parent phrase)
    learningStep: number;
    nextReviewDate: Date | null;
    lastReviewDate: Date | null;
    showCount: number;
    practiceCount: number;

    // Context Rotation Cache
    lastPracticeConfig?: {
        register: Register;
        relationship: SocialDistance;
        topic: string;
    };

    createdAt: Date;
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

// NOTE: Topics are now dynamically managed in Firestore via /lib/db/topics.ts
// Old TOPIC_HIERARCHY, TOPIC_OPTIONS, etc. have been removed

// Scenario Practice Mode types
export interface ScenarioPhrase {
    phrase: string;
    phraseId: string;
    meaning: string;
    used: boolean;
    turnUsedIn: number | null;
    status: 'natural' | 'forced' | 'missing' | 'pending';
    feedback: string;
}

export interface ScenarioTurn {
    turnNumber: number;              // 1, 2, 3...
    userMessage: string;
    phrasesUsedThisTurn: string[];
    characterResponse: string;       // Was: opponentResponse
    timestamp: Timestamp | Date | string;
    languageAnalysis?: {
        issues: Array<{ text: string; problem: string; alternatives: string[] }>;
        praise: string | null;
        overall: string;
    };
}

export interface ScenarioSession {
    id: string;
    userId: string;

    // Scenario briefing
    scenario: string;                // "You're checking into a hotel..."
    userRole: string;                // "A tired business traveler"
    goal: string;                    // "Check in and ask about breakfast"
    objectives?: string[];           // ["Confirm booking dates", "Ask about late checkout"]

    // Character info
    characterName: string;           // "Emma"
    characterRole: string;           // "Hotel receptionist"
    characterOpening: string;        // First message from character

    // Practice material
    phrases: ScenarioPhrase[];       // Target phrases (3-5)
    register: Register;              // Formality level for conversation

    // Conversation
    turns: ScenarioTurn[];           // Max 3-5 turns
    status: 'active' | 'completed' | 'abandoned';
    isScheduled: boolean;            // true = from /practice (SRS), false = from /vocab (on-demand)

    createdAt: Timestamp;
    completedAt?: Timestamp;
}

// Token usage tracking for admin analytics
export interface TokenUsage {
    id: string;
    userId: string;
    userEmail: string;
    endpoint: string;           // e.g., "generate-meaning", "scenario-turn"
    model: string;              // "deepseek-chat" or "gemini-3-flash"
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: Timestamp;
}

// Practice History for Context Rotation
export interface PracticeLog {
    id: string;
    userId: string;
    phraseId: string;
    phrase: string;

    // The specific context configuration used in this session
    usedTags: {
        register: Register;
        relationship: SocialDistance;
        topic: string;
    };

    mode: 'passive' | 'active_mcq' | 'active_open';
    result: 'correct' | 'wrong' | 'revealed';
    timestamp: Timestamp;
}

// Admin-managed collections for grouping posts
export interface Collection {
    id: string;
    name: string;               // "Business English", "IELTS Prep"
    description?: string;       // Optional description
    coverColor?: string;        // Tailwind color class for display (e.g., "blue", "emerald")
    postIds: string[];          // Array of post IDs in this collection
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// User-owned reading list (cloned from collection or user-created)
export interface UserReadingList {
    id: string;
    userId: string;              // Owner of this list
    name: string;                // Can be customized by user
    description?: string;
    coverColor?: string;         // Tailwind color class
    postIds: string[];           // Posts in this list
    sourceId?: string;           // If cloned, original collection ID
    isPublic: boolean;           // Whether shared publicly on profile
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ============================================================================
// GLOBAL PHRASE DICTIONARY
// ============================================================================

// Variant of a phrase with different register or nuance
export interface PhraseVariant {
    phrase: string;
    register: Register;
    nuance: Nuance;
    relationship: 'register_variant' | 'nuance_variant' | 'synonym';
}

// MCQ question for practice
export interface PhraseQuestion {
    id: string;
    scenario: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

// Questions grouped by phrase type
export interface PhraseQuestions {
    root: PhraseQuestion[];
    usages: Array<{
        forPhrase: string;
        questions: PhraseQuestion[];
    }>;
    variants: Array<{
        forPhrase: string;
        questions: PhraseQuestion[];
    }>;
}

// Global phrase data shared across all users
export interface GlobalPhraseData {
    phraseKey: string;           // Normalized key (lowercase, underscores)
    phrase: string;              // Original text
    baseForm: string;            // For dedup tracking

    // Core (Show to users)
    meaning: string;
    context?: string;            // Original sentence where found
    contextTranslation?: string; // Vietnamese translation of context

    // Pronunciation
    pronunciation?: string;      // IPA transcription
    audioUrl?: string;           // Audio file URL

    // Classification - Multi-value arrays for naturalness
    register: Register | Register[];      // Formality levels where natural
    nuance: Nuance | Nuance[];           // Sentiments/connotations
    socialDistance?: SocialDistance[];   // Relationship contexts where natural (NEW)
    topic: string | string[];            // Topic(s)
    subtopic?: string | string[];        // Subtopic(s)
    isHighFrequency: boolean;

    // Hidden - For Future Learning
    commonUsages: CommonUsage[];      // 0-5 collocations/phrasal verbs
    registerVariants: PhraseVariant[]; // 0-3 different formality
    nuanceVariants: PhraseVariant[];   // 0-3 different sentiment
    questions?: PhraseQuestions;        // MCQ questions (generated by nightly job)
    questionBankId?: string;           // Legacy link to question bank

    // Meta
    lookupCount: number;         // How many times looked up
    saveCount: number;           // How many users saved this
    generatedAt: Timestamp;
}

// ============================================================================
// CONVERSATION EXERCISE TYPES
// ============================================================================

// Participant in a conversation
export interface Participant {
    id: string;
    name: string;
    role: 'user' | 'friend' | 'colleague' | 'boss' | 'stranger' | 'customer' | 'other';
    avatar?: string;
}

// Single message in a conversation
export interface ConversationMessage {
    id: string;
    speakerId: string;
    speakerName: string;
    text: string;
    highlightedPhrases?: string[];  // Phrases highlighted in this message
    register: Register;
    nuance: Nuance;
    // For user turns in active mode
    coachingHint?: string;  // Natural guidance: "Tell her not to rush"
    targetPhrases?: string[];  // Internal: which phrases this tests (can be multiple)
    registerVariants?: string[];  // MCQ options: same meaning, different registers
}

// Scene in a progressive conversation
export interface ConversationScene {
    id: string;
    location?: string;  // "Coffee Shop", "Office", etc.
    description?: string;  // Scene transition description
    sceneIntro?: string;  // Narrative introduction setting the scene (like a novel)
    participants: Participant[];
    register: Register;  // Primary register for this scene
    messages: ConversationMessage[];
}

// Comprehension question for register/nuance awareness
export interface ConversationComprehensionQuestion {
    id: string;
    type: 'register_shift' | 'formal_equivalent' | 'casual_equivalent' | 'appropriate_choice' | 'nuance_detection';
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    relatedPhrases?: string[];  // Phrases this question tests
}

// Full conversation exercise
export interface ConversationExercise {
    id: string;
    format: 'real_life' | 'chat_group';
    title: string;
    description?: string;
    storyIntro?: string;  // Overall story introduction setting up the narrative
    scenes: ConversationScene[];
    targetPhrases: string[];  // All phrases being practiced
    questions: ConversationComprehensionQuestion[];
    createdAt: Timestamp;
    userId?: string;  // If generated for specific user
}

// ============================================================================
// DUOLINGO-STYLE EXERCISE SYSTEM
// ============================================================================

// Session types for the new exercise system
export type ExerciseSessionType = 'quick_practice' | 'story' | 'listening';

// ============================================================================
// INLINE EXERCISE SYSTEM (Blended Learning)
// ============================================================================

// Where exercises can appear in the app
export type ExerciseSurface =
    | 'quote_swiper'    // Feed QuoteSwiper cards
    | 'swipe_reader'    // Article SwipeReader cards
    | 'full_article'    // Inline callout in full article
    | 'action_gate'     // Before save/unlock actions
    | 'dead_time'       // During loading states
    | 'exercises_page'; // Dedicated /practice page

// Simplified to 2 learning phases (was 4)
export type LearningPhase = 'recognition' | 'production';

// Question types organized into 2 phases
export type ExerciseQuestionType =
    // Recognition Phase (Review 1-3) — All surfaces
    | 'social_consequence_prediction'  // What happens if you say this?
    | 'situation_phrase_matching'      // Which phrase fits this situation? (MCQ)
    | 'tone_interpretation'            // How does the speaker feel?
    | 'contrast_exposure'              // What's the difference between X and Y?
    | 'why_did_they_say'               // Why did they use THIS phrase?
    | 'appropriateness_judgment'       // Is this phrase appropriate here?
    | 'error_detection'                // What's wrong with this usage?
    | 'fill_gap_mcq'                   // Complete the blank (MCQ)
    | 'register_sorting'               // Sort phrases by formality
    | 'reading_comprehension'          // GMAT RC: understand phrase in passage
    | 'sentence_correction'            // GMAT SC: fix subtly misused phrase

    // Production Phase (Review 4+) — Exercises page + Full Article only
    | 'constrained_production'         // Use phrase with given constraints
    | 'transformation_exercise'        // Change register (casual→formal)
    | 'dialogue_completion_open'       // Complete dialogue (open response)
    | 'text_completion'                // GMAT TC: fill blanks in paragraph
    | 'scenario_production'            // Generate full response using phrase
    | 'multiple_response_generation'   // Give 2+ valid responses
    | 'explain_to_friend'              // Teach someone when to use this
    | 'creative_context_use'           // Create your own context

    // Story session specific (kept for story/listening modes)
    | 'story_intro'                    // Read context (no answer required)
    | 'listen_select'                  // Hear audio, pick phrase
    | 'type_what_you_hear';            // Dictation

// Universal inline question format — used by all exercise surfaces
export interface InlineQuestion {
    id: string;
    phraseId: string;
    phrase: string;
    surface: ExerciseSurface;
    phase: LearningPhase;
    questionType: ExerciseQuestionType;

    // Context-rich scenario (2-3 sentences, not one-liners)
    scenario: string;
    // Cluster phrases woven into the scenario for passive exposure
    clusterPhrases?: string[];

    // For recognition types (MCQ / binary)
    options?: string[];
    correctIndex?: number;

    // For production types (text input)
    prompt?: string;

    explanation?: string;
    emotion?: string;  // e.g. 'sarcasm', 'panic', 'tenderness' — for UI badge
    format?: string;   // e.g. 'fill_blank', 'tone_read', 'spot_error', 'best_response', 'true_false'
    xpReward: number;
}

// Base interface for all question content types
interface BaseQuestionContent {
    type: ExerciseQuestionType;
}

// Story Intro - just displays text, no answer
export interface StoryIntroContent extends BaseQuestionContent {
    type: 'story_intro';
    title: string;
    narrative: string;
    setting?: string;
    characters?: string[];
    segments?: StorySegment[]; // NEW: For structured conversational display
}

// Fill Gap MCQ - fill blank in conversation (was complete_dialogue)
export interface FillGapMCQContent extends BaseQuestionContent {
    type: 'fill_gap_mcq';
    dialogue: Array<{
        speaker: string;
        text: string;
        isBlank?: boolean;  // True if this is the blank to fill
    }>;
    options: string[];
    correctIndex: number;
    explanation?: string;
}

// Situation Phrase Matching - choose best response (was what_would_you_say)
export interface SituationPhraseMatchingContent extends BaseQuestionContent {
    type: 'situation_phrase_matching';
    context: string;       // Situation description
    prompt: string;        // What the other person said or did
    options: string[];
    correctIndex: number;
    explanation?: string;
}

// Listen & Select - audio with MCQ
export interface ListenSelectContent extends BaseQuestionContent {
    type: 'listen_select';
    audioText: string;     // Text that will be converted to audio
    audioUrl?: string;     // Generated audio URL
    question: string;      // "What phrase did you hear?"
    options: string[];
    correctIndex: number;
    explanation?: string;
}

// Why Did They Say - comprehension question (was story_recall)
export interface WhyDidTheySayContent extends BaseQuestionContent {
    type: 'why_did_they_say';
    question: string;      // "What happened when Maya used this phrase?"
    options: string[];
    correctIndex: number;
    explanation?: string;
    relatedParagraph?: string;  // Reference to story section
}

// Social Consequence Prediction - predict outcomes (was complete_the_story)
export interface SocialConsequenceContent extends BaseQuestionContent {
    type: 'social_consequence_prediction';
    storyExcerpt: string;  // Story text with _____ for blank
    blankPosition: number; // Character position of blank
    options: string[];
    correctIndex: number;
    explanation?: string;
}

// Error Detection - find wrong word (was spot_mistake)
export interface ErrorDetectionContent extends BaseQuestionContent {
    type: 'error_detection';
    sentence: string;      // Sentence with mistake
    wrongWord: string;     // The incorrect word
    options: string[];     // Possible correct words
    correctIndex: number;
    explanation?: string;
}

// Type What You Hear - dictation
export interface TypeWhatYouHearContent extends BaseQuestionContent {
    type: 'type_what_you_hear';
    audioText: string;     // Text to be spoken
    audioUrl?: string;     // Generated audio URL
    acceptableAnswers: string[];  // Variations that are correct
    hint?: string;         // Optional hint
}

// Appropriateness Judgment - when to use (was choose_situation)
export interface AppropriatenessJudgmentContent extends BaseQuestionContent {
    type: 'appropriateness_judgment';
    phrase: string;        // The phrase in question
    question: string;      // "When would you use this?"
    options: string[];     // Situation descriptions
    correctIndex: number;
    explanation?: string;
}

// Constrained Production - write using phrase with constraints (was free_response)
export interface ConstrainedProductionContent extends BaseQuestionContent {
    type: 'constrained_production';
    targetPhrase: string;
    prompt: string;        // "Write a sentence using..."
    hint?: string;
    context: string;       // Context for AI evaluation
}

// Transformation Exercise - formal/casual conversion (was register_swap)
export interface TransformationExerciseContent extends BaseQuestionContent {
    type: 'transformation_exercise';
    originalPhrase: string;
    originalRegister: Register;
    targetRegister: Register;
    prompt: string;        // "Make this more formal/casual"
    hint?: string;
    acceptableAnswers?: string[];  // For client-side validation
}
// Tone Interpretation - identify speaker's emotion
export interface ToneInterpretationContent extends BaseQuestionContent {
    type: 'tone_interpretation';
    context: string;        // Brief situation
    dialogue: string;       // Speaker says target phrase
    question: string;       // "How does [speaker] feel?"
    options: string[];      // Emotion options
    correctIndex: number;
    explanation?: string;
}

// Contrast Exposure - show differences between similar phrases
export interface ContrastExposureContent extends BaseQuestionContent {
    type: 'contrast_exposure';
    phrase1: string;
    phrase2: string;
    context: string;        // Situation where difference matters
    scenario1: string;      // Outcome when phrase1 used
    scenario2: string;      // Outcome when phrase2 used
    question: string;       // "What's the difference?"
    explanation: string;
}

// Register Sorting - categorize phrases by formality
export interface RegisterSortingContent extends BaseQuestionContent {
    type: 'register_sorting';
    phrases: string[];      // Phrases to sort
    categories: string[];   // e.g., ["Casual", "Neutral", "Formal"]
    correctAssignment: Record<string, string>;  // phrase → category
    explanation?: string;
}

// Dialogue Completion Open - free-form dialogue completion
export interface DialogueCompletionOpenContent extends BaseQuestionContent {
    type: 'dialogue_completion_open';
    context: string;        // Situation description
    dialogueBefore: string; // Dialogue leading up to blank
    targetPhrase: string;   // Phrase that should be used
    hint?: string;
    rubric: {
        phrase_used: boolean;
        natural_flow: boolean;
        context_appropriate: boolean;
    };
}

// Scenario Production - full response generation
export interface ScenarioProductionContent extends BaseQuestionContent {
    type: 'scenario_production';
    scenario: string;       // Full scenario description
    targetPhrase: string;   // Phrase to use naturally
    evaluationCriteria: {
        phrase_present: boolean;
        natural_use: string;     // 4-tier rubric result
        context_appropriate: boolean;
        social_awareness: boolean;
    };
}

// Multiple Response Generation - generate 2+ valid responses
export interface MultipleResponseGenerationContent extends BaseQuestionContent {
    type: 'multiple_response_generation';
    context: string;        // Situation description
    targetPhrase: string;   // Phrase to demonstrate
    requiredCount: number;  // Min responses (usually 2)
    hint?: string;
}

// Explain to Friend - teach the phrase
export interface ExplainToFriendContent extends BaseQuestionContent {
    type: 'explain_to_friend';
    setup: string;          // "Your friend who's learning English asks..."
    targetPhrase: string;
    requirements: string[]; // What to include in explanation
}

// Creative Context Use - create own context
export interface CreativeContextUseContent extends BaseQuestionContent {
    type: 'creative_context_use';
    targetPhrase: string;
    prompt: string;         // "Create a situation where you'd use this"
    constraints?: string[]; // Optional constraints
}

// GMAT-Style: Reading Comprehension - understand phrase in passage context
export interface ReadingComprehensionContent extends BaseQuestionContent {
    type: 'reading_comprehension';
    passage: string;           // 3-5 sentence paragraph using the phrase naturally
    targetPhrase: string;      // The phrase being tested
    question: string;          // "What does X mean in this context?" or inference Q
    options: string[];
    correctIndex: number;
    explanation?: string;
}

// GMAT-Style: Sentence Correction - identify and fix misused phrase
export interface SentenceCorrectionContent extends BaseQuestionContent {
    type: 'sentence_correction';
    sentence: string;          // Sentence with subtly misused phrase
    underlinedPortion: string; // The misused part (highlighted in UI)
    options: string[];         // 4 correction options (one is "No change needed")
    correctIndex: number;
    explanation?: string;
}

// GMAT-Style: Text Completion - fill blanks in paragraph from word bank
export interface TextCompletionContent extends BaseQuestionContent {
    type: 'text_completion';
    paragraph: string;         // Text with [BLANK_1] and [BLANK_2] placeholders
    blanks: Array<{            // Info for each blank
        id: string;            // e.g. "BLANK_1"
        correctAnswer: string; // The right phrase
    }>;
    wordBank: string[];        // 5-6 options including correct + distractors
    explanation?: string;
}

// Skill categories for GMAT-style node labeling
export type SkillCategory =
    | 'Contextual Usage'
    | 'Register Awareness'
    | 'Pragmatic Reasoning'
    | 'Error Analysis'
    | 'Reading Comprehension'
    | 'Active Recall'
    | 'Meta-Knowledge';

// Maps each skill to its question types
export const SKILL_QUESTION_MAP: Record<SkillCategory, ExerciseQuestionType[]> = {
    'Contextual Usage': ['situation_phrase_matching', 'fill_gap_mcq', 'social_consequence_prediction', 'appropriateness_judgment'],
    'Register Awareness': ['register_sorting', 'transformation_exercise'],
    'Pragmatic Reasoning': ['why_did_they_say', 'tone_interpretation', 'contrast_exposure'],
    'Error Analysis': ['error_detection', 'sentence_correction'],
    'Reading Comprehension': ['reading_comprehension'],
    'Active Recall': ['constrained_production', 'dialogue_completion_open', 'scenario_production', 'text_completion'],
    'Meta-Knowledge': ['explain_to_friend', 'multiple_response_generation', 'creative_context_use'],
};

// Union type for all question content
export type ExerciseQuestionContent =
    | StoryIntroContent
    | FillGapMCQContent
    | SituationPhraseMatchingContent
    | ListenSelectContent
    | WhyDidTheySayContent
    | SocialConsequenceContent
    | ErrorDetectionContent
    | TypeWhatYouHearContent
    | AppropriatenessJudgmentContent
    | ConstrainedProductionContent
    | TransformationExerciseContent
    | ToneInterpretationContent
    | ContrastExposureContent
    | RegisterSortingContent
    | DialogueCompletionOpenContent
    | ScenarioProductionContent
    | MultipleResponseGenerationContent
    | ExplainToFriendContent
    | CreativeContextUseContent
    | ReadingComprehensionContent
    | SentenceCorrectionContent
    | TextCompletionContent;

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// These aliases maintain compatibility with existing components using old names
// ============================================================================
/** @deprecated Use FillGapMCQContent instead */
export type CompleteDialogueContent = FillGapMCQContent;
/** @deprecated Use SituationPhraseMatchingContent instead */
export type WhatWouldYouSayContent = SituationPhraseMatchingContent;
/** @deprecated Use WhyDidTheySayContent instead */
export type StoryRecallContent = WhyDidTheySayContent;
/** @deprecated Use SocialConsequenceContent instead */
export type CompleteTheStoryContent = SocialConsequenceContent;
/** @deprecated Use ErrorDetectionContent instead */
export type SpotMistakeContent = ErrorDetectionContent;
/** @deprecated Use AppropriatenessJudgmentContent instead */
export type ChooseSituationContent = AppropriatenessJudgmentContent;
/** @deprecated Use ConstrainedProductionContent instead */
export type FreeResponseContent = ConstrainedProductionContent;
/** @deprecated Use TransformationExerciseContent instead */
export type RegisterSwapContent = TransformationExerciseContent;


export interface ExerciseQuestion {
    id: string;
    type: ExerciseQuestionType;
    content: ExerciseQuestionContent;
    targetPhraseIds: string[];   // Phrases being TESTED
    contextPhraseIds: string[];  // Phrases for context only (not tested)
    xpReward: number;
    explanation?: string;
    trivia?: string;
}

// Story context for a session
export interface StorySegment {
    type: 'dialogue' | 'narration';
    text: string;
    speaker?: string;      // Name of speaker (e.g. "Marcus")
    speakerRole?: string;  // Role/Title (e.g. "Philosopher")
}

export interface ExerciseStoryContext {
    title: string;
    setting: string;
    characters: string[];
    narrative: string;           // Full story text (legacy/fallback)
    paragraphs: string[];        // Story split into paragraphs (legacy/fallback)
    segments: StorySegment[];    // NEW: Structured segments for conversational UI
    audioUrl?: string;           // For listening sessions
}

// Complete exercise session
export interface ExerciseSession {
    id: string;
    userId: string;
    type: ExerciseSessionType;
    clusterId: string;
    storyContext: ExerciseStoryContext;
    questions: ExerciseQuestion[];
    testedPhraseIds: string[];
    contextPhraseIds: string[];
    usagesIncluded?: Array<{
        parentPhraseId: string;
        parentPhrase: string;
        usage: { phrase: string; meaning: string; type: string };
    }>;
    status: 'pending' | 'in_progress' | 'completed';
    createdAt: Timestamp;
    completedAt?: Timestamp;
}

// Result of answering a question
export interface QuestionResult {
    questionId: string;
    correct: boolean;
    userAnswer: string;
    xpEarned: number;
    timeTaken: number;           // Seconds
}

// Result of completing a session
export interface SessionResult {
    sessionId: string;
    questionsAnswered: number;
    correctAnswers: number;
    totalXpEarned: number;
    accuracy: number;            // 0-100
    timeTaken: number;           // Total seconds
    phraseResults: Array<{
        phraseId: string;
        correct: boolean;
        newLearningStep?: number;
    }>;
}

// User daily progress
export interface DailyProgress {
    userId: string;
    date: string;                // YYYY-MM-DD
    quickPracticeCompleted: boolean;
    storyCompleted: boolean;
    listeningCompleted: boolean;
    totalXp: number;
    streakMaintained: boolean;
}

// AI evaluation result for free response / register swap
export interface AIEvaluationResult {
    correct: boolean;
    naturalness: 'natural' | 'forced' | 'incorrect';
    feedback: string;
    suggestion?: string;         // Better phrasing if not natural
}

