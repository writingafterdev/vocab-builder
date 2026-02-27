/**
 * Speaking Feedback System - Type Definitions
 * 
 * Comprehensive analysis result from Gemini including:
 * - Overall score
 * - Vocabulary feedback (detailed with register, nuance, pragmatics)
 * - Speaking skills (pronunciation, fluency, grammar, connected speech)
 * - Intonation patterns
 * - Annotated transcript
 */

// ============================================
// Main Response Interface
// ============================================

export interface SpeakingAnalysisResult {
    overallScore: number; // 0-100
    transcript: string;

    skills: {
        pronunciation: SkillScore;
        fluency: FluencyScore;
        vocabulary: number;
        grammar: GrammarScore;
        connectedSpeech: ConnectedSpeechScore;
    };

    vocabularyFeedback: VocabDetailedFeedback[];
    intonation: IntonationData;
    annotatedWords: AnnotatedWord[];

    insights: {
        strength: string;
        tip: string;
        focusArea: string;
    };
}

// ============================================
// Vocabulary Feedback (PRIMARY - Detailed)
// ============================================

export interface VocabDetailedFeedback {
    phraseId: string;
    phrase: string;
    used: boolean;
    status: 'perfect' | 'good' | 'issues' | 'not_used';

    register: {
        status: 'match' | 'mismatch' | 'na';
        expected: RegisterLevel;
        actual: RegisterLevel;
        explanation: string;
        alternative?: string;
    };

    nuance: {
        score: 1 | 2 | 3; // 1=weak, 2=acceptable, 3=perfect
        explanation: string;
        betterFit?: string;
    };

    pragmatics: {
        appropriate: boolean;
        context: string;
        issue?: string;
        suggestion?: string;
    };

    collocation: {
        correct: boolean;
        expected?: string;
        actual?: string;
        explanation?: string;
    };

    encouragement?: string;
}

export type RegisterLevel = 'formal' | 'neutral' | 'casual' | 'slang';

// ============================================
// Speaking Skills
// ============================================

export interface SkillScore {
    score: number; // 0-100
    issues: Array<{
        word: string;
        issue: string;
        correction: string;
    }>;
}

export interface FluencyScore {
    score: number;
    speechRate: number; // WPM
    pauseCount: number;
    fillers: string[]; // ["um", "uh"]
}

export interface GrammarScore {
    score: number;
    errors: Array<{
        original: string;
        correction: string;
        rule: string;
    }>;
}

export interface ConnectedSpeechScore {
    score: number;
    patterns: Array<{
        type: 'linking' | 'elision' | 'assimilation' | 'weak_form' | 'intrusion';
        expected: string;
        actual: string;
        correct: boolean;
    }>;
}

// ============================================
// Intonation
// ============================================

export interface IntonationData {
    words: string[];
    expectedPattern: number[]; // 0-1 pitch values
    userPattern: number[];
}

// ============================================
// Annotated Transcript
// ============================================

export interface AnnotatedWord {
    text: string;
    status: 'correct' | 'pronunciation' | 'grammar' | 'collocation';
    annotation?: string; // e.g., "th→f"
}

// ============================================
// Weakness Categories (for Daily Drill)
// ============================================

export type WeaknessCategory =
    | 'pronunciation'
    | 'grammar'
    | 'register'
    | 'nuance'
    | 'pragmatics'
    | 'connected_speech'
    | 'collocation';

export interface ExtractedWeakness {
    category: WeaknessCategory;
    specific: string;
    severity: 1 | 2 | 3;
    example: string;
    correction: string;
    explanation: string;
}

/**
 * Extract weaknesses from analysis result for saving to user profile
 */
export function extractWeaknesses(result: SpeakingAnalysisResult): ExtractedWeakness[] {
    const weaknesses: ExtractedWeakness[] = [];

    // Pronunciation issues
    result.skills.pronunciation.issues.forEach(issue => {
        weaknesses.push({
            category: 'pronunciation',
            specific: issue.issue.toLowerCase().replace(/\s+/g, '_'),
            severity: 2,
            example: issue.word,
            correction: issue.correction,
            explanation: `Pronunciation: "${issue.word}" → "${issue.correction}"`
        });
    });

    // Grammar errors
    result.skills.grammar.errors.forEach(error => {
        weaknesses.push({
            category: 'grammar',
            specific: error.rule.toLowerCase().replace(/\s+/g, '_'),
            severity: 2,
            example: error.original,
            correction: error.correction,
            explanation: error.rule
        });
    });

    // Vocabulary issues (register, nuance, pragmatics)
    result.vocabularyFeedback.forEach(vocab => {
        if (vocab.register.status === 'mismatch') {
            weaknesses.push({
                category: 'register',
                specific: `register_${vocab.register.expected}_vs_${vocab.register.actual}`,
                severity: 2,
                example: vocab.phrase,
                correction: vocab.register.alternative || '',
                explanation: vocab.register.explanation
            });
        }

        if (vocab.nuance.score === 1) {
            weaknesses.push({
                category: 'nuance',
                specific: 'nuance_mismatch',
                severity: 2,
                example: vocab.phrase,
                correction: vocab.nuance.betterFit || '',
                explanation: vocab.nuance.explanation
            });
        }

        if (!vocab.pragmatics.appropriate && vocab.pragmatics.issue) {
            weaknesses.push({
                category: 'pragmatics',
                specific: 'pragmatics_inappropriate',
                severity: 2,
                example: vocab.phrase,
                correction: vocab.pragmatics.suggestion || '',
                explanation: vocab.pragmatics.issue
            });
        }

        if (!vocab.collocation.correct && vocab.collocation.expected) {
            weaknesses.push({
                category: 'collocation',
                specific: 'collocation_error',
                severity: 2,
                example: vocab.collocation.actual || vocab.phrase,
                correction: vocab.collocation.expected,
                explanation: vocab.collocation.explanation || 'Unnatural word combination'
            });
        }
    });

    // Connected speech issues
    result.skills.connectedSpeech.patterns
        .filter(p => !p.correct)
        .forEach(pattern => {
            weaknesses.push({
                category: 'connected_speech',
                specific: `connected_${pattern.type}`,
                severity: 1,
                example: pattern.actual,
                correction: pattern.expected,
                explanation: `Should use ${pattern.type}: "${pattern.expected}"`
            });
        });

    return weaknesses;
}
