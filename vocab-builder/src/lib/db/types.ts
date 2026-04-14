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

/** @deprecated Replaced by new PassiveQuestionType in v2 exercise system */
export type LegacyQuestionType =
    | 'character_motivation'
    | 'outcome_consequence'
    | 'problem_identification'
    | 'turning_point'
    | 'tone_mood_shift'
    | 'relationship_dynamics'
    | 'attitude_reading'
    | 'decision_reasoning'
    | 'communication_intent'
    | 'detail_tracking'
    | 'comparison_contrast'
    | 'gap_inference'
    | 'perspective_analysis';

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
    type: LegacyQuestionType;
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

    // ====== EXERCISE TRACKING ======
    // Tracks which question types have been used for variety
    completedFormats?: QuestionType[];
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
// PASSAGE-CENTRIC EXERCISE SYSTEM (v2)
// Thinking-first design: all questions derive from a single anchor passage.
// Vocabulary is embedded naturally, never headlined.
// ============================================================================

// ── Skill Axes ──
export type SkillAxis = 'cohesion' | 'task_achievement' | 'naturalness';

// ── Question Types (12-type MVP) ──
export type PassiveQuestionType =
    // Cohesion & Coherence
    | 'spot_intruder'           // Which sentence breaks paragraph unity?
    | 'restructure'             // Reorder scrambled sentences into logical flow
    | 'match_pairs'             // Connect matching items (synonym, register, meaning)
    | 'tap_passage'             // Tap on sentence/phrase/word in the passage
    // Task Achievement
    | 'fallacy_id'              // Name the logical flaw in the argument
    | 'inference_bridge'        // Given the claim, what logically follows?
    | 'rate_argument'           // Solid / has holes / falls apart
    // Naturalness & Flexibility
    | 'ab_natural'              // Pick which sentence sounds more natural
    | 'register_sort'           // Sort sentences by formality
    | 'tone_interpretation'     // What does the author's tone signal?
    | 'fill_blank'              // Fill the blank from a word bank
    | 'swipe_judge'             // Swipe right (natural) or left (unnatural)
    // Categorization & Pragmatics
    | 'category_sort'           // Sort items into labeled bins (register, connotation, etc.)
    | 'best_response'           // Pick the best conversational response in a dialogue
    | 'cloze_passage';          // Fill multiple blanks in a paragraph from a shared word bank

export type ActiveQuestionType =
    // Task Achievement
    | 'fix_argument'            // Repair broken reasoning
    // Naturalness
    | 'register_shift'          // Rewrite for a different audience
    // Synthesis (all axes)
    | 'synthesis_response'      // Free-form position + vocab usage
    // Assembly & Correction
    | 'build_sentence'          // Arrange word chips into a correct sentence
    | 'spot_and_fix';           // Tap the error word, type the correction

export type QuestionType = PassiveQuestionType | ActiveQuestionType;

// ── Surfaces ──
export type ExerciseSurface = 'session' | 'feed_card';

// ── Feed Card Types ──
export type FeedCardType =
    | 'ab_natural'       // A/B pick — fastest to attempt
    | 'retry'            // Error-driven retry (reframed question)
    | 'spot_flaw'        // Logical flaw MCQ
    | 'spot_intruder'    // Unity break detection
    | 'fix_it';          // Active redirect → pre-generated session

export type SourcePlatform =
    | 'linkedin' | 'whatsapp' | 'twitter' | 'reddit'
    | 'email' | 'cover_letter' | 'yelp_review' | 'news_oped';

// ── Anchor Passage (core of every session) ──
export interface AnchorPassage {
    text: string;                    // 600-900 word generated passage
    topic: string;                   // e.g. "AI ethics in hiring"
    centralClaim: string;            // The passage's arguable position
    deliberateFlaws: {
        logicalGap: string;          // Description of embedded logical gap
        weakTransition: string;      // Which transition is weak
        registerBreak: string;       // Which sentence has register inconsistency
    };
    embeddedVocab: string[];         // Vocab words naturally embedded
    sourcePlatform?: SourcePlatform; // What real-world format it mimics
}

// ── Session Question ──
export interface SessionQuestion {
    id: string;
    type: QuestionType;
    skillAxis: SkillAxis;
    // Excerpt grouping: questions sharing an excerptId are shown under the same passage block
    excerptId?: string;              // e.g. "ex_1" — groups questions under same excerpt
    excerptText?: string;            // The shared excerpt text (set on first question of group)
    // Content
    prompt: string;                  // The question text
    passageReference?: string;       // Specific excerpt from anchor passage (legacy / fallback)
    // For passive (MCQ-based)
    options?: string[];
    correctIndex?: number;
    // For reorder types
    items?: string[];                // Sentences to reorder
    correctOrder?: number[];         // Correct order indices
    // For active (free response)
    evaluationCriteria?: string[];   // What AI checks for
    // For fill_blank
    blankSentence?: string;          // Sentence with ____ placeholder
    wordBank?: string[];             // Options to fill the blank
    correctWord?: string;            // The correct word
    // For swipe_judge
    swipeCards?: Array<{             // Cards to swipe on
        text: string;
        isNatural: boolean;          // true = swipe right, false = swipe left
    }>;
    // For match_pairs
    pairs?: Array<{                  // Items to match
        left: string;
        right: string;
    }>;
    // For tap_passage
    tappableSegments?: string[];     // Segments the passage is split into
    correctSegmentIndex?: number;    // Which segment is the correct answer
    // Feedback
    explanation: string;
    // Phase-based session: which learning phase this question targets
    learningPhase?: 'recognition' | 'active_recall' | 'production';
    // Production tracking: phrases the user should use in freewrite
    expectedPhrases?: string[];          // Phrase text to use
    expectedPhraseIds?: string[];        // Corresponding phrase doc IDs
    phraseUsageResults?: Array<{         // Filled after AI evaluation
        phraseId: string;
        phrase: string;
        used: boolean;
        usageQuality: 'natural' | 'forced' | 'missing';
    }>;
    // For category_sort
    categories?: string[];               // Bin labels (e.g. ["Formal", "Casual"])
    categoryItems?: Array<{              // Items to sort into bins
        text: string;
        correctCategory: number;         // Index into categories array
    }>;
    // For build_sentence
    sentenceChips?: string[];            // Word/phrase chips to arrange
    correctSentence?: string;            // The correct assembled sentence
    // For spot_and_fix
    errorSentence?: string;              // Sentence containing an error
    errorSegments?: string[];            // Sentence split into tappable segments
    errorIndex?: number;                 // Index of the error segment
    correctFix?: string;                 // The correct replacement
    // For best_response (dialogue turn)
    dialogueTurns?: Array<{              // Conversation thread
        speaker: string;                 // Speaker name/label
        text: string;                    // What they said
    }>;
    responseOptions?: string[];          // Response choices
    correctResponseIndex?: number;       // Index of correct response
    // For cloze_passage
    clozeText?: string;                  // Paragraph with __(1)__, __(2)__ etc.
    blanks?: Array<{                     // Blank definitions
        index: number;                   // Blank number (1-based)
        correctWord: string;             // Correct fill
    }>;
    // Listening mode: audio-first presentation of the question
    isListening?: boolean;               // If true, passage/options are heard, not read
    listeningText?: string;              // Text to synthesize (defaults to passageReference)
    // Chaining: references a previous question this builds on
    chainedFrom?: string;            // ID of the Phase 2 question this extends
}

// ── Exercise Session ──
export interface ExerciseSession {
    id: string;
    userId: string;
    anchorPassage: AnchorPassage;
    questions: SessionQuestion[];
    vocabWordIds: string[];          // SavedPhrase IDs embedded in passage
    status: 'generated' | 'in_progress' | 'completed';
    createdAt: string;
    completedAt?: string;
    results?: SessionQuestionResult[];
}

// ── Session Question Result ──
export interface SessionQuestionResult {
    questionId: string;
    type: QuestionType;
    skillAxis: SkillAxis;
    correct: boolean;
    userAnswer: string;              // Index for MCQ, text for active
    timeTaken: number;               // Seconds
    aiFeedback?: string;             // For active questions
    // Production tracking: per-phrase usage results from freewrite evaluation
    phraseUsageResults?: Array<{
        phraseId: string;
        phrase: string;
        used: boolean;
        usageQuality: 'natural' | 'forced' | 'missing';
    }>;
}

// ── Feed Card ──
export interface FeedCard {
    id: string;
    userId: string;
    cardType: FeedCardType;
    skillAxis: SkillAxis;
    // Source content block (real-world format)
    sourceContent: string;           // The LinkedIn post / WhatsApp message / etc.
    sourcePlatform: SourcePlatform;
    sourceLabel: string;             // "💼 LinkedIn post"
    // Question
    prompt: string;
    options?: string[];
    correctIndex?: number;
    explanation: string;
    // Vocab (embedded, never headlined)
    vocabWordId?: string;
    vocabPhrase?: string;
    // Retry-specific
    isRetry?: boolean;
    retryQuestionType?: QuestionType;
    daysSinceError?: number;
    // Fix It redirect
    linkedSessionId?: string;        // Pre-generated session to redirect to
    // Timing
    estimatedSeconds: number;        // Shows on card
    createdAt: string;
    answeredAt?: string;
    answeredCorrectly?: boolean;
}

// ── Per-Question-Type Weakness Tracking ──
// One doc per user per question type (max 12 docs per user in MVP)
export interface QuestionTypeWeakness {
    id: string;                      // `${userId}_${questionType}`
    userId: string;
    questionType: QuestionType;
    skillAxis: SkillAxis;
    wrongCount: number;
    correctCount: number;
    weight: number;                  // wrongs / (wrongs + corrects), 0-1
    lastWrongAt: string;
    lastCorrectAt?: string;
    // Recent error instances for retry card context
    recentErrors: Array<{
        vocabPhrase?: string;
        sessionId?: string;
        feedCardId?: string;
        userAnswer: string;
        timestamp: string;
    }>;
}

// ── AI Evaluation Result (for active questions) ──
export interface AIEvaluationResult {
    correct: boolean;
    criteria: {
        logicalValidity?: boolean;   // Does the claim follow from premises?
        cohesion?: boolean;          // Does it read as a unified piece?
        registerFit?: boolean;       // Is the tone appropriate?
        vocabUsage?: 'natural' | 'forced' | 'absent'; // Target word usage
    };
    feedback: string;                // One-paragraph diagnosis
    suggestion?: string;             // Better phrasing if applicable
}
