import {
    canGenerateQuestionType,
    candidateBandsForTarget,
    onDemandGenerationBandForTarget,
    shouldExcludeSeenQuestion,
    shouldUseFeed,
} from '@/lib/exercise/pool-policy';
import type { SessionQuestion } from '@/lib/db/types';

describe('Exercise pool policy', () => {
    it('maps learning bands to reusable candidate buckets', () => {
        expect(candidateBandsForTarget('recognition')).toEqual(['recognition']);
        expect(candidateBandsForTarget('active_recall')).toEqual(['active_recall', 'recognition']);
        expect(candidateBandsForTarget('production')).toEqual(['production', 'active_recall', 'recognition']);
    });

    it('never creates production items through on-demand refill', () => {
        expect(onDemandGenerationBandForTarget('production')).toBe('active_recall');
        expect(canGenerateQuestionType('synthesis_response', false)).toBe(false);
        expect(canGenerateQuestionType('register_shift', false)).toBe(false);
        expect(canGenerateQuestionType('fix_argument', false)).toBe(false);
    });

    it('allows production generation only for scheduled prefill', () => {
        expect(canGenerateQuestionType('synthesis_response', true)).toBe(true);
        expect(canGenerateQuestionType('register_shift', true)).toBe(true);
        expect(canGenerateQuestionType('fix_argument', true)).toBe(true);
    });

    it('keeps feed limited to cheap low-friction questions', () => {
        const feedQuestion = {
            id: 'q1',
            type: 'best_response',
            skillAxis: 'naturalness',
            prompt: 'Pick the best reply.',
            explanation: 'It fits the context.',
            isFeedEligible: true,
        } satisfies SessionQuestion;

        const productionQuestion = {
            ...feedQuestion,
            id: 'q2',
            type: 'synthesis_response',
        } satisfies SessionQuestion;

        expect(shouldUseFeed(feedQuestion)).toBe(true);
        expect(shouldUseFeed(productionQuestion)).toBe(false);
    });

    it('treats seen feed and practice questions as first-pass exclusions', () => {
        const seen = new Set(['q1']);
        expect(shouldExcludeSeenQuestion('q1', seen, 'feed')).toBe(true);
        expect(shouldExcludeSeenQuestion('q1', seen, 'practice')).toBe(true);
        expect(shouldExcludeSeenQuestion('q2', seen, 'practice')).toBe(false);
    });
});
