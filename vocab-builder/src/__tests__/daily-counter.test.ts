/**
 * Tests for daily counter utility
 * These tests ensure the daily phrase counting works correctly
 */

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'dispatchEvent', { value: jest.fn() });

import { getTodaySavedCount, incrementDailyCount, resetDailyCount } from '@/lib/daily-counter';

describe('daily-counter', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    describe('getTodaySavedCount', () => {
        it('should return 0 for new day', () => {
            expect(getTodaySavedCount()).toBe(0);
        });

        it('should return saved count for today', () => {
            // Increment to set a value
            incrementDailyCount(5);
            expect(getTodaySavedCount()).toBe(5);
        });

        it('should return 0 for stale data from yesterday', () => {
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            localStorageMock.setItem('dailyPhraseCount', JSON.stringify({ date: yesterday, count: 10 }));
            // The function should detect stale data and return 0
            const count = getTodaySavedCount();
            expect(count).toBe(0);
        });
    });

    describe('incrementDailyCount', () => {
        it('should increment from 0', () => {
            incrementDailyCount(1);
            expect(getTodaySavedCount()).toBe(1);
        });

        it('should increment existing count', () => {
            incrementDailyCount(3);
            incrementDailyCount(2);
            expect(getTodaySavedCount()).toBe(5);
        });

        it('should handle multiple phrase increments', () => {
            incrementDailyCount(5);
            expect(getTodaySavedCount()).toBe(5);
        });
    });

    describe('resetDailyCount', () => {
        it('should reset count to 0', () => {
            incrementDailyCount(10);
            resetDailyCount();
            expect(getTodaySavedCount()).toBe(0);
        });
    });
});
