export type LearningGoal = 'natural_english' | 'beautiful_english';

export interface NativeWordSeed {
    word: string;
    definition: string;
    vibe: string;
    register: string;
    difficulty: string;
    tags: string[];
    example: string;
    followupText: string;
    qualityScore: number;
    status: 'active' | 'draft' | 'disabled';
}

export interface NativeWordPoolEntry extends NativeWordSeed {
    id?: string;
    wordKey: string;
    createdAt?: string;
    updatedAt?: string;
    payload?: Record<string, unknown>;
}

export interface NativeFeedState {
    viewedNativeWordKeys: string[];
    servedNativeFollowupKeys: string[];
}

export function normalizeNativeWordKey(word: string): string {
    return word
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s-]+/g, '_')
        .replace(/^_+/, '')
        .slice(0, 80);
}

export function coerceLearningGoal(value: unknown): LearningGoal {
    return value === 'beautiful_english' ? 'beautiful_english' : 'natural_english';
}

export function parseStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value !== 'string' || value.trim().length === 0) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string')
            : [];
    } catch {
        return [];
    }
}

export function parsePayload(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value !== 'string' || value.trim().length === 0) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function selectNativeWordsForFeed(
    words: NativeWordPoolEntry[],
    state: NativeFeedState,
    goal: LearningGoal,
    limit: number
): NativeWordPoolEntry[] {
    const activeWords = words
        .filter((word) => word.status === 'active')
        .sort((a, b) => b.qualityScore - a.qualityScore);

    const viewed = new Set(state.viewedNativeWordKeys);
    const fresh = activeWords.filter((word) => !viewed.has(word.wordKey));
    const resurfaced = activeWords.filter((word) => viewed.has(word.wordKey));
    const source = fresh.length >= limit ? fresh : [...fresh, ...resurfaced];

    const goalLimit = goal === 'beautiful_english' ? limit : Math.min(limit, 5);
    return source.slice(0, goalLimit);
}

export function validateNativeWordSeedEntry(entry: Partial<NativeWordSeed>): string[] {
    const errors: string[] = [];
    const requiredTextFields: Array<keyof NativeWordSeed> = [
        'word',
        'definition',
        'vibe',
        'register',
        'difficulty',
        'example',
        'followupText',
        'status',
    ];

    for (const field of requiredTextFields) {
        if (typeof entry[field] !== 'string' || String(entry[field]).trim().length === 0) {
            errors.push(`Missing ${field}`);
        }
    }

    if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
        errors.push('Missing tags');
    }

    if (typeof entry.qualityScore !== 'number' || entry.qualityScore < 0 || entry.qualityScore > 1) {
        errors.push('qualityScore must be between 0 and 1');
    }

    if (entry.definition && entry.definition.length > 160) {
        errors.push('definition should stay short');
    }

    if (entry.word && normalizeNativeWordKey(entry.word).length === 0) {
        errors.push('word cannot produce a valid wordKey');
    }

    return errors;
}
