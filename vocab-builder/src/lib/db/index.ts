/**
 * Database module exports
 * Re-exports all domain-specific functions for backward compatibility
 */

// Core utilities
export { checkDb, db } from './core';

// Domain modules
export * from './posts';
export * from './comments';
export * from './social';
export * from './srs';
export * from './users';
export * from './admin';
export * from './decks';

// Types
export type { Post, Comment, Repost, Like, SavedPhrase, LearningCycleSettings, Deck, DeckPhrase, UserDeckSubscription } from './types';
export { DEFAULT_LEARNING_CYCLE } from './types';
export type { DeckType, DeckStatus, PhraseMetadataStatus } from './types';
